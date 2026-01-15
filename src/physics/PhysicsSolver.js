export class PhysicsSolver {
  constructor() {
    this.gravity = 9.81; // Standard gravity
  }
  
  /**
   * Check if two axis-aligned bounding boxes (AABBs) overlap
   * Boxes are defined by their position (center) and dimensions
   */
  checkCollision(box1, box2) {
    // Calculate bounds for box1
    const b1MinX = box1.x - box1.width / 2;
    const b1MaxX = box1.x + box1.width / 2;
    const b1MinY = box1.y - box1.height / 2;
    const b1MaxY = box1.y + box1.height / 2;
    const b1MinZ = box1.z - box1.depth / 2;
    const b1MaxZ = box1.z + box1.depth / 2;
    
    // Calculate bounds for box2
    const b2MinX = box2.x - box2.width / 2;
    const b2MaxX = box2.x + box2.width / 2;
    const b2MinY = box2.y - box2.height / 2;
    const b2MaxY = box2.y + box2.height / 2;
    const b2MinZ = box2.z - box2.depth / 2;
    const b2MaxZ = box2.z + box2.depth / 2;
    
    // Check for overlap on all three axes
    const overlapX = b1MaxX > b2MinX && b1MinX < b2MaxX;
    const overlapY = b1MaxY > b2MinY && b1MinY < b2MaxY;
    const overlapZ = b1MaxZ > b2MinZ && b1MinZ < b2MaxZ;
    
    return overlapX && overlapY && overlapZ;
  }
  
  /**
   * Check if a box collides with any boxes in a list
   */
  checkCollisionWithList(box, boxList) {
    for (const other of boxList) {
      if (this.checkCollision(box, other)) {
        return true;
      }
    }
    return false;
  }
  
  /**
   * Check if a box is within container bounds
   * Container is positioned at origin with dimensions
   */
  isWithinContainer(box, container) {
    const boxMinX = box.x - box.width / 2;
    const boxMaxX = box.x + box.width / 2;
    const boxMinY = box.y - box.height / 2;
    const boxMaxY = box.y + box.height / 2;
    const boxMinZ = box.z - box.depth / 2;
    const boxMaxZ = box.z + box.depth / 2;
    
    const containerMinX = -container.width / 2;
    const containerMaxX = container.width / 2;
    const containerMinY = 0;
    const containerMaxY = container.height;
    const containerMinZ = -container.depth / 2;
    const containerMaxZ = container.depth / 2;
    
    return boxMinX >= containerMinX &&
           boxMaxX <= containerMaxX &&
           boxMinY >= containerMinY &&
           boxMaxY <= containerMaxY &&
           boxMinZ >= containerMinZ &&
           boxMaxZ <= containerMaxZ;
  }
  
  /**
   * Apply gravity simulation to drop a box to its resting position
   * Returns the final Y position where the box should rest
   */
  dropBox(box, placedBoxes, container) {
    const epsilon = 0.001; // Small value to avoid floating point issues
    
    // Start from current Y position and drop down
    let testY = box.y;
    const minY = box.height / 2; // Bottom of container (floor is at Y=0)
    
    // Drop in small increments until we hit something
    while (testY > minY) {
      const testBox = { ...box, y: testY };
      
      // Check if this position collides with any placed boxes
      let collision = false;
      for (const placedBox of placedBoxes) {
        if (this.checkCollision(testBox, placedBox)) {
          collision = true;
          break;
        }
      }
      
      if (collision) {
        // Move back up slightly and return
        return testY + 0.1;
      }
      
      testY -= 0.5; // Drop increment
    }
    
    // Rests on the floor
    return minY + epsilon;
  }
  
  /**
   * Calculate support stability score
   * Higher score = more stable (more support from below)
   * Returns value between 0 and 1
   */
  calculateStability(box, placedBoxes, container) {
    const boxMinX = box.x - box.width / 2;
    const boxMaxX = box.x + box.width / 2;
    const boxMinZ = box.z - box.depth / 2;
    const boxMaxZ = box.z + box.depth / 2;
    const boxBottomY = box.y - box.height / 2;
    
    // If resting on floor, it's perfectly stable
    if (Math.abs(boxBottomY) < 0.1) {
      return 1.0;
    }
    
    // Calculate the bottom face area
    const bottomArea = box.width * box.depth;
    let supportedArea = 0;
    
    // Check each placed box to see if it provides support
    const supportThreshold = 0.5; // How close boxes need to be to provide support
    
    for (const placedBox of placedBoxes) {
      const placedTopY = placedBox.y + placedBox.height / 2;
      
      // Check if this box is directly below (within threshold)
      if (Math.abs(placedTopY - boxBottomY) < supportThreshold) {
        // Calculate overlap area in XZ plane
        const overlapMinX = Math.max(boxMinX, placedBox.x - placedBox.width / 2);
        const overlapMaxX = Math.min(boxMaxX, placedBox.x + placedBox.width / 2);
        const overlapMinZ = Math.max(boxMinZ, placedBox.z - placedBox.depth / 2);
        const overlapMaxZ = Math.min(boxMaxZ, placedBox.z + placedBox.depth / 2);
        
        if (overlapMaxX > overlapMinX && overlapMaxZ > overlapMinZ) {
          const overlapArea = (overlapMaxX - overlapMinX) * (overlapMaxZ - overlapMinZ);
          supportedArea += overlapArea;
        }
      }
    }
    
    // Return ratio of supported area to total bottom area
    const stability = Math.min(supportedArea / bottomArea, 1.0);
    
    // Penalize cantilever: if less than 50% supported, apply additional penalty
    if (stability < 0.5) {
      return stability * 0.5; // Heavy penalty for cantilever
    }
    
    return stability;
  }
  
  /**
   * Check if a placement is valid (no collisions, within bounds, stable enough)
   */
  isValidPlacement(box, placedBoxes, container, minStability = 0.3) {
    // Check container bounds
    if (!this.isWithinContainer(box, container)) {
      return false;
    }
    
    // Check collisions with other boxes
    if (this.checkCollisionWithList(box, placedBoxes)) {
      return false;
    }
    
    // Check stability (unless resting on floor)
    const bottomY = box.y - box.height / 2;
    if (bottomY > 0.1) {
      const stability = this.calculateStability(box, placedBoxes, container);
      if (stability < minStability) {
        return false;
      }
    }
    
    return true;
  }
}
