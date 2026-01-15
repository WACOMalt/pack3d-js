import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export class Viewport3D {
  constructor(container, appState) {
    this.container = container;
    this.appState = appState;
    
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    
    this.containerMesh = null;
    this.boxMeshes = [];
  }
  
  init() {
    this.setupScene();
    this.setupCamera();
    this.setupRenderer();
    this.setupControls();
    this.setupLights();
    this.createContainer();
    this.createStatsPanel();
    
    this.animate();
    this.handleResize();
    
    window.addEventListener('resize', () => this.handleResize());
  }
  
  setupScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0f0f0f);
    
    // Add grid helper
    const gridHelper = new THREE.GridHelper(200, 20, 0x444444, 0x222222);
    this.scene.add(gridHelper);
  }
  
  setupCamera() {
    const aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 2000);
    this.camera.position.set(40, 40, 40);
    this.camera.lookAt(0, 0, 0);
  }
  
  setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);
  }
  
  setupControls() {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.screenSpacePanning = false;
    this.controls.minDistance = 2;
    this.controls.maxDistance = 500;
    this.controls.maxPolarAngle = Math.PI / 2;
  }
  
  setupLights() {
    // Ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambientLight);
    
    // Directional light
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(100, 200, 100);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 500;
    this.scene.add(directionalLight);
    
    // Fill light
    const fillLight = new THREE.DirectionalLight(0x8888ff, 0.3);
    fillLight.position.set(-50, 50, -50);
    this.scene.add(fillLight);
  }
  
  createContainer() {
    const { width, height, depth } = this.appState.container;
    
    // Remove old container
    if (this.containerMesh) {
      this.scene.remove(this.containerMesh);
    }
    
    // Create transparent container box with open top
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const edges = new THREE.EdgesGeometry(geometry);
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0x60a5fa, linewidth: 2, depthTest: true });
    const wireframe = new THREE.LineSegments(edges, lineMaterial);
    
    // Create semi-transparent walls (5 faces, no top)
    const materials = [
      new THREE.MeshStandardMaterial({ color: 0x2a2a2a, transparent: true, opacity: 0.05, side: THREE.DoubleSide, depthWrite: false }), // right
      new THREE.MeshStandardMaterial({ color: 0x2a2a2a, transparent: true, opacity: 0.05, side: THREE.DoubleSide, depthWrite: false }), // left
      new THREE.MeshStandardMaterial({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false }), // top - invisible
      new THREE.MeshStandardMaterial({ color: 0x3a3a3a, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false }), // bottom
      new THREE.MeshStandardMaterial({ color: 0x2a2a2a, transparent: true, opacity: 0.05, side: THREE.DoubleSide, depthWrite: false }), // front
      new THREE.MeshStandardMaterial({ color: 0x2a2a2a, transparent: true, opacity: 0.05, side: THREE.DoubleSide, depthWrite: false })  // back
    ];
    
    const containerBox = new THREE.Mesh(geometry, materials);
    containerBox.position.set(0, height / 2, 0);
    
    this.containerMesh = new THREE.Group();
    this.containerMesh.add(wireframe);
    this.containerMesh.add(containerBox);
    wireframe.position.set(0, height / 2, 0);
    
    this.scene.add(this.containerMesh);
  }
  
  createStatsPanel() {
    // Create HTML stats overlay
    const existing = document.querySelector('.stats-panel');
    if (existing) existing.remove();
    
    const statsPanel = document.createElement('div');
    statsPanel.className = 'stats-panel';
    statsPanel.innerHTML = `
      <h4>Visualization</h4>
      <p id="box-count">Boxes: 0</p>
      <p id="container-dims">Container: ${this.appState.container.width} × ${this.appState.container.height} × ${this.appState.container.depth}</p>
    `;
    this.container.appendChild(statsPanel);
  }
  
  updateStatsPanel() {
    const boxCountEl = document.getElementById('box-count');
    const containerDimsEl = document.getElementById('container-dims');
    
    if (boxCountEl) {
      boxCountEl.textContent = `Boxes: ${this.appState.placedBoxes.length}`;
    }
    
    if (containerDimsEl) {
      const { width, height, depth } = this.appState.container;
      containerDimsEl.textContent = `Container: ${width} × ${height} × ${depth}`;
    }
  }
  
  update() {
    this.createContainer();
    this.updateBoxes();
    this.updateStatsPanel();
  }
  
  updateBoxes() {
    // Remove old box meshes
    this.boxMeshes.forEach(mesh => this.scene.remove(mesh));
    this.boxMeshes = [];
    
    // Create new box meshes from placed boxes
    this.appState.placedBoxes.forEach((placedBox, index) => {
      const geometry = new THREE.BoxGeometry(
        placedBox.width,
        placedBox.height,
        placedBox.depth
      );
      
      // Use different colors for different box definitions
      const hue = (placedBox.definitionId * 137.5) % 360; // Golden angle for color distribution
      const color = new THREE.Color().setHSL(hue / 360, 0.7, 0.5);
      
      const material = new THREE.MeshStandardMaterial({
        color: color,
        transparent: false,
        opacity: 1.0,
        roughness: 0.7,
        metalness: 0.2,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1
      });
      
      const mesh = new THREE.Mesh(geometry, material);
      
      // Position box (positions are at box centers)
      mesh.position.set(
        placedBox.x,
        placedBox.y,
        placedBox.z
      );
      
      // Add edges for better visibility
      const edges = new THREE.EdgesGeometry(geometry);
      const edgeMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 1 });
      const edgeLines = new THREE.LineSegments(edges, edgeMaterial);
      mesh.add(edgeLines);
      
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      
      this.scene.add(mesh);
      this.boxMeshes.push(mesh);
    });
  }
  
  handleResize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    
    this.renderer.setSize(width, height);
  }
  
  animate() {
    requestAnimationFrame(() => this.animate());
    
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
