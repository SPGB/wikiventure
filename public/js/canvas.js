var scene = new THREE.Scene();
var camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );

var renderer = new THREE.WebGLRenderer();
renderer.setSize( window.innerWidth, window.innerHeight );
document.body.appendChild( renderer.domElement );

var geometry = new THREE.BoxGeometry( 4, 4, 4 );
var material = new THREE.MeshBasicMaterial( { color: 0xB163A3 } );
var cube = new THREE.Mesh( geometry, material );
scene.add( cube );

camera.position.z = 5;

function render() {
	requestAnimationFrame( render );
	renderer.render( scene, camera );
	rotate();
}
function rotate() {
	cube.rotation.x += 0.01;
	cube.rotation.y += 0.01;
}
render();