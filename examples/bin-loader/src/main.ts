import { Scene, PerspectiveCamera, WebGLRenderer, Group, Raycaster, Vector2 } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as dat from 'dat.gui';

import { COLMAPLoader } from '../../../dist';
import { ColmapData } from '../../../dist/COLMAPLoader';

const sceneContainer = document.querySelector<HTMLDivElement>('#app')!;

/**
 * Data to load.
 * You can download the samples from https://demuc.de/colmap/datasets/ and convert the .txt to .bin with colmap model_converter cli tool
 */
const DATA_PATH = "colmap/south-building_no"

const colmap = await new Promise<ColmapData>((resolve) => {
	new COLMAPLoader().load(`${DATA_PATH}`, (data) => {
		resolve(data);
	}, (progressEvent) => {
		sceneContainer.innerText = `colmap loading progress: ${progressEvent.loaded / progressEvent.total * 100}%`
	}, (err) => {
		console.error(err);
	})
});
// alternatively if you don't need progress events
// const colmap = await new COLMAPLoader().loadAsync(`${DATA_PATH}`);

// clean up preloader text
sceneContainer.innerHTML = ""


// init three.js stuff
const scene = new Scene();
const camera = new PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 5;

const renderer = new WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
sceneContainer.append(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);

// Resize renderer on window resize
window.addEventListener('resize', function () {
	var width = window.innerWidth;
	var height = window.innerHeight;
	renderer.setSize(width, height);
	camera.aspect = width / height;
	camera.updateProjectionMatrix();
});

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// COLMAP uses a right handed up down facing coordinate system,
// in order to convert it to the right handed up facing coordinate system of three.js 
// we rotate 180° around the x axis for user friendliness
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
const colmapContainer = new Group();
colmapContainer.rotateX(Math.PI)
scene.add(colmapContainer);

////////////////////////////////
// Create point cloud object //
//////////////////////////////

colmapContainer.add(colmap.mesh);

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Create camera helpers. We put the camera helpers in a group, so that we can easy toggle their visibility on and off //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
const camerasContainer = new Group();
colmapContainer.add(camerasContainer);

colmap.cameraPoses.forEach((pose) => {
	const image = colmap.images[pose.imageId];
	const camera = image.camera_id;
	const cameraMesh = colmap.createCameraMesh(colmap.cameras[camera]);
	cameraMesh.userData = { pose }
	cameraMesh.position.copy(pose.position);
	cameraMesh.quaternion.copy(pose.quaternion)
	camerasContainer.add(cameraMesh);
});

///////////////////////////////////////////////////////////////////////////
// Add click event to get image which was taken from the clicked camera //
/////////////////////////////////////////////////////////////////////////
const raycaster = new Raycaster();
const pointer = new Vector2();
window.addEventListener("click", (event) => {
	pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
	pointer.y = - (event.clientY / window.innerHeight) * 2 + 1;
	raycaster.setFromCamera(pointer, camera);

	const intersects = raycaster.intersectObjects(camerasContainer.children, false);
	if (intersects.length > 0 && intersects[0].object.userData?.pose) {
		console.log("Image tanked from the clicked camera", colmap.images[intersects[0].object.userData.pose.imageId].name);
	}
})

////////////////////////////////////////////////////
// Add point size and camera visibility controls //
//////////////////////////////////////////////////
const gui = new dat.GUI();
gui.add(colmap.mesh.material as any, "size", 0, 10).name("Point Size")
gui.add(camerasContainer, "visible", true).name("Show cameras")


///////////////////////
// Main render loop //
/////////////////////
function animate() {
	controls.update();
	renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);
