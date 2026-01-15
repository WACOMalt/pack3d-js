export class AppState {
  constructor() {
    // Container constraints - null means unconstrained (will be optimized)
    this.containerConstraints = {
      width: null,
      height: null,
      depth: null
    };
    
    // Optimized container size (result of optimization)
    this.container = {
      width: 20,
      height: 10,
      depth: 20
    };
    
    this.boxes = [
      { id: 1, width: 1, height: 1, depth: 1, quantity: 1 }
    ];
    
    this.placedBoxes = []; // Result of optimization
    this.isOptimizing = false;
    this.optimizationStats = null;
    
    this.listeners = [];
    this.nextBoxId = 2;
  }
  
  // Subscribe to state changes
  subscribe(listener) {
    this.listeners.push(listener);
  }
  
  // Notify all listeners of state change
  notify() {
    this.listeners.forEach(listener => listener(this));
  }
  
  // Update container constraints (null = unconstrained, number = fixed dimension)
  updateContainerConstraints(constraints) {
    this.containerConstraints = { ...this.containerConstraints, ...constraints };
    this.notify();
  }
  
  // Update container dimensions (result of optimization)
  updateContainer(dimensions) {
    this.container = { ...this.container, ...dimensions };
    this.notify();
  }
  
  // Get count of constrained dimensions
  getConstrainedDimensionCount() {
    return Object.values(this.containerConstraints).filter(v => v !== null).length;
  }
  
  // Add a new box definition
  addBox() {
    this.boxes.push({
      id: this.nextBoxId++,
      width: 1,
      height: 1,
      depth: 1,
      quantity: 1
    });
    this.notify();
  }
  
  // Update a box definition
  updateBox(id, updates) {
    const box = this.boxes.find(b => b.id === id);
    if (box) {
      Object.assign(box, updates);
      this.notify();
    }
  }
  
  // Remove a box definition
  removeBox(id) {
    this.boxes = this.boxes.filter(b => b.id !== id);
    this.notify();
  }
  
  // Set the optimization result
  setPlacedBoxes(placedBoxes, stats) {
    this.placedBoxes = placedBoxes;
    this.optimizationStats = stats;
    this.isOptimizing = false;
    this.notify();
  }
  
  // Mark optimization as in progress
  startOptimization() {
    this.isOptimizing = true;
    this.notify();
  }
  
  // Get all boxes expanded by quantity
  getExpandedBoxes() {
    const expanded = [];
    let instanceId = 0;
    
    this.boxes.forEach(boxDef => {
      for (let i = 0; i < boxDef.quantity; i++) {
        expanded.push({
          instanceId: instanceId++,
          definitionId: boxDef.id,
          width: boxDef.width,
          height: boxDef.height,
          depth: boxDef.depth
        });
      }
    });
    
    return expanded;
  }
}
