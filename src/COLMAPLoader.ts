import { BufferAttribute, BufferGeometry, FileLoader, Loader, LoadingManager, Matrix3, Matrix4, Mesh, MeshBasicMaterial, Points, PointsMaterial, Quaternion, Vector3 } from "three";

type PreciseProgressTrack = {
    "points3D": {
        total: number,
        loaded: number,
        data?: ArrayBuffer,
    }, "images": {
        total: number,
        loaded: number,
        data?: ArrayBuffer,
    }, "cameras": {
        total: number,
        loaded: number,
        data?: ArrayBuffer,
    }
}

export type CameraModel = {
    model_id: number;
    model_name: string;
    num_params: number;
}

export const CAMERA_MODELS: CameraModel[] = [
    { model_id: 0, model_name: 'SIMPLE_PINHOLE', num_params: 3 },
    { model_id: 1, model_name: 'PINHOLE', num_params: 4 },
    { model_id: 2, model_name: 'SIMPLE_RADIAL', num_params: 4 },
    { model_id: 3, model_name: 'RADIAL', num_params: 5 },
    { model_id: 4, model_name: 'OPENCV', num_params: 8 },
    { model_id: 5, model_name: 'OPENCV_FISHEYE', num_params: 8 },
    { model_id: 6, model_name: 'FULL_OPENCV', num_params: 12 },
    { model_id: 7, model_name: 'FOV', num_params: 5 },
    { model_id: 8, model_name: 'SIMPLE_RADIAL_FISHEYE', num_params: 4 },
    { model_id: 9, model_name: 'RADIAL_FISHEYE', num_params: 5 },
    { model_id: 10, model_name: 'THIN_PRISM_FISHEYE', num_params: 12 }
];

const CAMERA_MODEL_IDS: { [key: number]: CameraModel } = {};
const CAMERA_MODEL_NAMES: { [key: string]: CameraModel } = {};

CAMERA_MODELS.forEach((camera_model) => {
    CAMERA_MODEL_IDS[camera_model.model_id] = camera_model;
    CAMERA_MODEL_NAMES[camera_model.model_name] = camera_model;
});

export { CAMERA_MODEL_IDS, CAMERA_MODEL_NAMES };

// Data loaded from cameras.bin
export type CameraBin = {
    id: number;
    model: string;
    width: number;
    height: number;
    params: number[]; // camera intrinsics
}

// Data loaded from images.bin
export type ImageBin = {
    camera_id: number,
    id: number,
    name: string,
    point3D_ids: number[],
    qvec: [number, number, number, number], // quaternion, WXYZ
    tvec: [number, number, number], // translation
    xys: Array<[number, number]>, // array of 2D feature points
}

// Data loaded from points.bin
export type PointBin = {
    id: number,
    xyz: [number, number, number], // position
    rgb: [number, number, number], // [byte, byte, byte]
    error: number,
    imageIds: number[],
    point2DIdxs: number[],
}

export type ColmapData = {
    images: { [index: number]: ImageBin },
    points3D: { [index: number]: PointBin },
    cameras: { [index: number]: CameraBin },
    mesh: Points,
    cameraPoses: { imageId: number, position: Vector3, quaternion: Quaternion }[],
    createCameraMesh: (camera: CameraBin) => Mesh
}

/**
 * Parses COLMAPs cameras.bin
 * returns a dictionary of CameraBin objects
 * ```
 * const cameras: {
 *   [id: number]: CameraBin; // id: camera.id
 * }
 * ```
 */
function readCamerasBinary(buffer: ArrayBuffer) {

    const dataView = new DataView(buffer);
    const cameras: { [id: number]: CameraBin } = {};

    let offset = 0;
    const numCameras = dataView.getBigUint64(offset, true);
    offset += 8;

    for (let i = 0; i < numCameras; i++) {
        const cameraProperties = [
            dataView.getInt32(offset, true),
            dataView.getInt32(offset + 4, true),
            dataView.getBigInt64(offset + 8, true),
            dataView.getBigInt64(offset + 16, true)
        ];
        offset += 24;

        const cameraId = cameraProperties[0];
        const modelId = cameraProperties[1];
        const modelName = CAMERA_MODEL_IDS[Number(cameraProperties[1])].model_name;
        const width = cameraProperties[2];
        const height = cameraProperties[3];
        const numParams = CAMERA_MODEL_IDS[Number(modelId)].num_params;

        const params = [];
        for (let j = 0; j < numParams; j++) {
            params.push(dataView.getFloat64(offset, true));
            offset += 8;
        }

        cameras[Number(cameraId)] = {
            id: Number(cameraId),
            model: modelName,
            width: Number(width),
            height: Number(height),
            params: params
        };
    }

    if (Object.keys(cameras).length !== Number(numCameras)) {
        throw new Error('Number of cameras does not match');
    }
    return cameras;
}

/**
 * Parses COLMAPs points3D.bin
 * returns a dictionary of PointBin objects
 * ```
 * const points3D: {
 *   [index: number]: PointBin; // index: point.id
 * }
 * ```
 */
function readPoints3DBinary(buffer: ArrayBuffer) {
    try {
        const dataView = new DataView(buffer);
        const points3D: { [index: number]: PointBin } = {};

        let offset = 0;
        const numPoints = dataView.getBigUint64(offset, true);
        offset += 8;

        for (let i = 0; i < numPoints; i++) {
            const point3DId = dataView.getBigUint64(offset, true);
            offset += 8;

            const x = dataView.getFloat64(offset, true);
            offset += 8;

            const y = dataView.getFloat64(offset, true);
            offset += 8;

            const z = dataView.getFloat64(offset, true);
            offset += 8;

            const r = dataView.getUint8(offset);
            offset += 1;

            const g = dataView.getUint8(offset);
            offset += 1;

            const b = dataView.getUint8(offset);
            offset += 1;

            const error = dataView.getFloat64(offset, true);
            offset += 8;

            const trackLength = dataView.getBigUint64(offset, true);
            offset += 8;

            const imageIds = [];
            const point2DIdxs = [];

            for (let j = 0; j < trackLength; j++) {
                const imageId = dataView.getInt32(offset, true);
                offset += 4;

                const point2DIdx = dataView.getInt32(offset, true);
                offset += 4;

                imageIds.push(imageId);
                point2DIdxs.push(point2DIdx);
            }

            points3D[Number(point3DId)] = {
                id: Number(point3DId),
                xyz: [x, y, z],
                rgb: [r, g, b],
                error: error,
                imageIds: imageIds,
                point2DIdxs: point2DIdxs
            };
        }
        return points3D;
    } catch (e) {
        throw new Error("Error reading points3D.bin. Original error - " + e);
    }
}


/**
 * Parses COLMAPs images.bin
 * returns a dictionary of ImageBin objects
 * ```
 * const images: {
 *   [index: number]: ImageBin; // index: image.id
 * }
 * ```
 */
function readImagesBinary(buffer: ArrayBuffer) {
    try {
        const dataView = new DataView(buffer);
        const images: { [index: number]: ImageBin } = {};

        let offset = 0;
        const numRegImages = dataView.getBigUint64(offset, true);
        offset += 8;

        for (let i = 0; i < numRegImages; i++) {
            const binaryImageProperties = [];
            for (let j = 0; j < 9; j++) {
                if (j === 0) {
                    binaryImageProperties.push(dataView.getInt32(offset, true));
                    offset += 4;
                } else if (j >= 1 && j <= 4) {
                    binaryImageProperties.push(dataView.getFloat64(offset, true));
                    offset += 8;
                } else if (j >= 5 && j <= 7) {
                    binaryImageProperties.push(dataView.getFloat64(offset, true));
                    offset += 8;
                } else {
                    binaryImageProperties.push(dataView.getInt32(offset, true));
                    offset += 4;
                }
            }

            const imageId = binaryImageProperties[0];
            const qvec = binaryImageProperties.slice(1, 5);
            const tvec = binaryImageProperties.slice(5, 8);
            const cameraId = binaryImageProperties[8];

            let binaryImageName = '';
            let currentChar = dataView.getUint8(offset);
            while (currentChar !== 0) {
                binaryImageName += String.fromCharCode(currentChar);
                offset += 1;
                currentChar = dataView.getUint8(offset);
            }
            offset += 1;

            const image_name = binaryImageName;
            const numPoints2D = dataView.getBigUint64(offset, true);
            offset += 8;

            const xys: Array<[number, number]> = [];
            const point3DIds = [];
            for (let k = 0; k < numPoints2D; k++) {
                const x = dataView.getFloat64(offset, true);
                offset += 8;
                const y = dataView.getFloat64(offset, true);
                offset += 8;

                /**
                 * This sometimes returns -1
                 * I'm not sure if that's intentional or a bug in COLMAP. Original python implementation also returns -1
                 * (you can check it in the colmap model_converter --output_type TXT)
                 */
                const id = dataView.getBigInt64(offset, true);
                offset += 8;

                xys.push([x, y]);
                point3DIds.push(Number(id));
            }

            images[imageId as number] = {
                id: imageId as number,
                qvec: qvec as [number, number, number, number],
                tvec: tvec as [number, number, number],
                camera_id: cameraId as number,
                name: image_name,
                xys: xys,
                point3D_ids: point3DIds
            };
        }
        return images;
    } catch (e) {
        throw new Error("Error reading images.bin. Original error - " + e);
    }
}

/**
 * 
 * @param colmapPoints 
 * @returns Points mesh created from the colmap points
 */
function getPointCloudMesh(colmapPoints: { [index: number]: PointBin }) {

    try {
        const points = Object.values(colmapPoints);

        const geometry = new BufferGeometry();

        const vertices = new Float32Array(points.length * 3);
        const colors = new Float32Array(points.length * 3);

        let point: PointBin;
        let index = 0;

        for (let i = 0; i < points.length; i++) {
            point = points[i];
            index = i * 3;
            vertices[index] = point.xyz[0];
            vertices[index + 1] = point.xyz[1];
            vertices[index + 2] = point.xyz[2];

            colors[index] = point.rgb[0] / 255;
            colors[index + 1] = point.rgb[1] / 255;
            colors[index + 2] = point.rgb[2] / 255;
        }
        geometry.setAttribute('position', new BufferAttribute(vertices, 3));
        geometry.setAttribute('color', new BufferAttribute(colors, 3));


        const pointCloudMaterial = new PointsMaterial({ vertexColors: true, sizeAttenuation: false });
        const pointCloudMesh = new Points(geometry, pointCloudMaterial);

        return pointCloudMesh;
    } catch (e) {
        throw new Error("Error creating point cloud mesh. Original error - " + e);
    }
}

/**
 * 
 * @param colmapImages 
 * @returns camera pose from where each image was taken from.
 */
function getCameraPoses(colmapImages: { [index: number]: ImageBin }) {

    const images = Object.values(colmapImages).map((image) => {
        // get the correct camera pose. Source https://colmap.github.io/format.html#images-txt
        const R = new Matrix4().makeRotationFromQuaternion(new Quaternion(image.qvec[1], image.qvec[2], image.qvec[3], image.qvec[0]));
        const RMatrix = new Matrix4().copy(R).transpose();

        // Get the translation vector
        const t = new Vector3(image.tvec[0], image.tvec[1], image.tvec[2]);
        t.applyMatrix4(RMatrix);
        t.negate();

        return { imageId: image.id, position: t, quaternion: new Quaternion().setFromRotationMatrix(RMatrix) };
    });

    return images;
}


/**
 * Creates pyramid mesh representing the camera.
 * 
 * @param camera: CameraBin
 * @returns THREE.Mesh
 */
function createCameraMesh(camera: CameraBin) {

    const w = camera.width;
    const h = camera.height;

    let fx, fy, cx, cy;
    if (['SIMPLE_PINHOLE', 'SIMPLE_RADIAL', 'RADIAL'].includes(camera.model)) {
        fx = fy = camera.params[0];
        cx = camera.params[1];
        cy = camera.params[2];
    } else if (['PINHOLE', 'OPENCV', 'OPENCV_FISHEYE', 'FULL_OPENCV'].includes(camera.model)) {
        fx = camera.params[0];
        fy = camera.params[1];
        cx = camera.params[2];
        cy = camera.params[3];
    } else {
        throw new Error('Camera model not supported');
    }

    // intrinsics
    const K = new Matrix3().set(
        fx, 0, cx,
        0, fy, cy,
        0, 0, 1
    );

    const Kinv = new Matrix3().copy(K).invert();
    // points in pixel
    const pointsPixel = [
        new Vector3(0, 0, 0),
        new Vector3(0, 0, 1),
        new Vector3(w, 0, 1),
        new Vector3(0, h, 1),
        new Vector3(w, h, 1)
    ];

    // pixel to camera coordinate system
    const points = pointsPixel.map(p => p.applyMatrix3(Kinv));

    const pyramidGeometry = new BufferGeometry();
    const vertices = new Float32Array([
        ...points[0].toArray(), // apex
        ...points[1].toArray(), // base points
        ...points[2].toArray(),
        ...points[3].toArray(),
        ...points[4].toArray()
    ]);

    const indices = new Uint16Array([
        0, 2, 1, // faces from apex to base
        0, 3, 1,
        0, 4, 1,
        1, 2, 3,
        3, 4, 2
    ]);

    pyramidGeometry.setAttribute('position', new BufferAttribute(vertices, 3));
    pyramidGeometry.setIndex(new BufferAttribute(indices, 1));

    const pyramidMaterial = new MeshBasicMaterial({ color: 0xcc3388, wireframe: true });
    const pyramid = new Mesh(pyramidGeometry, pyramidMaterial);

    pyramid.scale.setScalar(0.25);

    return pyramid;
}


/**
 * Loader for COLMAP's binary files.
 * TODO: support loading of COLMAP's .txt files
 */
export class COLMAPLoader extends Loader {
    constructor() {
        const manager = new LoadingManager();
        super(manager);
    }

    /**
     * 
     * @param url - Path to the folder containing the COLMAP binary files (points3D.bin, images.bin, cameras.bin)
     * @param onLoad 
     * @param onProgress 
     * @param onError 
     */
    load(url: string, onLoad: (data: ColmapData) => void, onProgress?: (event: ProgressEvent) => void, onError?: (err: unknown) => void): void {
        this.setPath(url);

        const totalLoadedData: PreciseProgressTrack = {
            "points3D": {
                total: 0,
                loaded: 0,
            }, "images": {
                total: 0,
                loaded: 0,
            }, "cameras": {
                total: 0,
                loaded: 0,
            }
        };

        this.manager.onLoad = () => {
            try {
                const images = readImagesBinary(totalLoadedData.images.data!);
                const points3D = readPoints3DBinary(totalLoadedData.points3D.data!);
                const cameras = readCamerasBinary(totalLoadedData.cameras.data!);
                const mesh = getPointCloudMesh(points3D);
                const cameraPoses = getCameraPoses(images);
                onLoad({ images, points3D, cameras, mesh, cameraPoses, createCameraMesh })
            } catch (e) {
                onError?.(e);
            }

        }

        const loader = new FileLoader(this.manager);
        loader.setRequestHeader(this.requestHeader);
        loader.setResponseType('arraybuffer');

        ["points3D", "images", "cameras"].forEach((key) => {
            const file = key as keyof PreciseProgressTrack;
            loader.load(`${this.path}/${file}.bin`, (data) => {
                totalLoadedData[file].data = data as ArrayBuffer;
            }, (progressEvent) => {
                if (onProgress) {
                    totalLoadedData[file].total = progressEvent.total;
                    totalLoadedData[file].loaded = progressEvent.loaded;

                    const total = totalLoadedData.points3D.total + totalLoadedData.images.total + totalLoadedData.cameras.total;
                    const loaded = totalLoadedData.points3D.loaded + totalLoadedData.images.loaded + totalLoadedData.cameras.loaded;
                    onProgress(new ProgressEvent("progress", { loaded, total }));
                }

            }, onError);
        })
    }

    override loadAsync(url: string, onProgress?: (event: ProgressEvent) => void,) {
        return super.loadAsync(url, onProgress) as Promise<ColmapData>;
    }
}