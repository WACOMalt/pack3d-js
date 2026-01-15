// This worker handles the CPU-intensive packing optimization
import { PhysicsSolver } from '../physics/PhysicsSolver.js';

class PackingWorker {
  constructor() {
    this.physicsSolver = new PhysicsSolver();
  }

  optimize(data) {
    const { boxes, constraints, maxAttempts } = data;
    const startTime = performance.now();
    
    // Report start
    self.postMessage({ type: 'progress', message: 'Initializing optimization...', progress: 0 });

    const result = this.findMinimumContainer(boxes, constraints);

    if (!result) {
      return {
        success: false,
        error: 'Could not find valid packing'
      };
    }

    const endTime = performance.now();
    const timeMs = Math.round(endTime - startTime);

    return {
      success: true,
      container: result.container,
      placedBoxes: result.placedBoxes,
      executionTime: timeMs
    };
  }

  findMinimumContainer(boxes, constraints) {
    // Identify which dimensions are unconstrained
    const unconstrainedDims = [];
    if (constraints.width === null) unconstrainedDims.push('width');
    if (constraints.height === null) unconstrainedDims.push('height');
    if (constraints.depth === null) unconstrainedDims.push('depth');
    
    // Calculate total volume and estimate starting size
    const totalVolume = boxes.reduce((sum, box) => 
      sum + (box.width * box.height * box.depth), 0);
    
    // Find the largest box dimension for each axis
    const maxBoxDims = {
      width: Math.max(...boxes.map(b => b.width)),
      height: Math.max(...boxes.map(b => b.height)),
      depth: Math.max(...boxes.map(b => b.depth))
    };
    
    // Start with initial estimates for unconstrained dimensions
    let currentContainer = {
      width: constraints.width || maxBoxDims.width,
      height: constraints.height || maxBoxDims.height,
      depth: constraints.depth || maxBoxDims.depth
    };

    // Helper to calculate volume of current container
    const getContainerVolume = (c) => c.width * c.height * c.depth;

    // Estimate unconstrained dimensions based on volume
    const constrainedVolume = 
      (constraints.width || 1) * 
      (constraints.height || 1) * 
      (constraints.depth || 1);
      
    if (unconstrainedDims.length > 0) {
      const remainingVolume = totalVolume * 1.5; // Add 50% buffer
      // If we have constraints, adjust estimate logic
      // Simplified: assume missing dims share remaining needed volume
      let volumeToDistribute = remainingVolume; 
      // This is simpler to just replicate the original logic exactly
      const volumePerDim = Math.pow(remainingVolume / constrainedVolume, 1 / unconstrainedDims.length);
      
      unconstrainedDims.forEach(dim => {
        currentContainer[dim] = Math.max(maxBoxDims[dim], Math.ceil(volumePerDim));
      });
    }

    // Binary search on each unconstrained dimension
    let dimIndex = 0;
    for (const dim of unconstrainedDims) {
      dimIndex++;
      self.postMessage({ 
        type: 'progress', 
        message: `Optimizing dimension: ${dim}...`, 
        progress: 10 + Math.floor((dimIndex / unconstrainedDims.length) * 40)
      });
      
      currentContainer[dim] = this.binarySearchDimension(
        boxes,
        currentContainer,
        dim,
        maxBoxDims[dim],
        Math.max(currentContainer[dim] * 3, maxBoxDims[dim] * 5)
      );
    }
    
    self.postMessage({ type: 'progress', message: 'Finalizing packing...', progress: 60 });

    // Final optimization attempt with found dimensions
    let placedBoxes = this.attemptPacking(boxes, currentContainer, 0);
    
    // Iterative expansion logic
    if (placedBoxes.length < boxes.length && unconstrainedDims.length > 0) {
      let attempts = 0;
      const MAX_EXPANSION_ATTEMPTS = 20;
      
      while (placedBoxes.length < boxes.length && attempts < MAX_EXPANSION_ATTEMPTS) {
        attempts++;
        self.postMessage({ 
            type: 'progress', 
            message: `Expanding container (Attempt ${attempts}/${MAX_EXPANSION_ATTEMPTS})...`, 
            progress: 60 + Math.floor((attempts / MAX_EXPANSION_ATTEMPTS) * 30)
        });

        // Expand unconstrained dimensions
        unconstrainedDims.forEach(dim => {
          currentContainer[dim] = Math.ceil(currentContainer[dim] * 1.1);
          if (currentContainer[dim] === currentContainer[dim] / 1.1) {
             currentContainer[dim] += 1;
          }
        });
        
        placedBoxes = this.attemptPacking(boxes, currentContainer, 0);
      }
    }
    
    // Final rounding to nearest 0.125 increment
    const increment = 0.125;
    ['width', 'height', 'depth'].forEach(dim => {
      // Ceil to increment
      currentContainer[dim] = Math.ceil(currentContainer[dim] / increment) * increment;
      // Fix floating point precision issues (e.g. 1.0000000001 -> 1)
      currentContainer[dim] = parseFloat(currentContainer[dim].toFixed(4));
    });

    self.postMessage({ type: 'progress', message: 'Done!', progress: 100 });
    return { container: currentContainer, placedBoxes };
  }

  binarySearchDimension(boxes, baseContainer, searchDim, minValue, maxValue) {
    const epsilon = 0.05; 
    let low = minValue;
    let high = maxValue;
    let bestFit = high;
    
    while (high - low > epsilon) {
      const mid = (low + high) / 2;
      const testContainer = { ...baseContainer, [searchDim]: mid };
      
      let success = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        const placed = this.attemptPacking(boxes, testContainer, attempt);
        if (placed.length === boxes.length) {
          success = true;
          break;
        }
      }
      
      if (success) {
        bestFit = mid;
        high = mid; 
      } else {
        low = mid + epsilon;
      }
    }
    
    return bestFit;
  }

  attemptPacking(boxes, container, seed) {
    const shuffledBoxes = [...boxes];
    this.shuffleArray(shuffledBoxes, seed);
    
    shuffledBoxes.sort((a, b) => {
      const volA = a.width * a.height * a.depth;
      const volB = b.width * b.height * b.depth;
      return volB - volA;
    });
    
    const placedBoxes = [];
    
    for (const box of shuffledBoxes) {
      const placement = this.findPlacement(box, placedBoxes, container, seed);
      if (placement) {
        placedBoxes.push(placement);
      }
    }
    
    return placedBoxes;
  }

  findPlacement(box, placedBoxes, container, seed) {
    const candidates = this.generateCandidatePositions(box, placedBoxes, container);
    
    this.shuffleArray(candidates, seed + box.instanceId);

    for (const candidate of candidates) {
      const testBox = {
        ...box,
        x: candidate.x,
        y: candidate.y,
        z: candidate.z
      };
      
      // Gravity / Drop Logic preserved from original
      if (candidate.y > box.height && !candidate.skipGravity) {
        testBox.y = this.physicsSolver.dropBox(testBox, placedBoxes, container);
      }
      
      if (this.physicsSolver.isValidPlacement(testBox, placedBoxes, container, 0.2)) {
        return testBox;
      }
    }
    
    return null;
  }

  generateCandidatePositions(box, placedBoxes, container) {
    const candidates = [];
    
    // Start with corner position (bottom-front-left) - Corrected Coordinate System
    candidates.push({
      x: -container.width / 2 + box.width / 2,
      y: box.height / 2,
      z: -container.depth / 2 + box.depth / 2
    });
    
    // For each placed box, try positions adjacent to it
    for (const placedBox of placedBoxes) {
      // Directly on top of placed box (most important for stacking!)
      candidates.push({
        x: placedBox.x,
        y: placedBox.y + placedBox.height / 2 + box.height / 2,
        z: placedBox.z,
        skipGravity: true // Don't drop this - it's meant to be on top
      });
      
      // On top but at different positions (if box is smaller)
      const topY = placedBox.y + placedBox.height / 2 + box.height / 2;
      candidates.push({
        x: placedBox.x + (placedBox.width - box.width) / 4,
        y: topY,
        z: placedBox.z,
        skipGravity: true
      });
      candidates.push({
        x: placedBox.x - (placedBox.width - box.width) / 4,
        y: topY,
        z: placedBox.z,
        skipGravity: true
      });
      candidates.push({
        x: placedBox.x,
        y: topY,
        z: placedBox.z + (placedBox.depth - box.depth) / 4,
        skipGravity: true
      });
      candidates.push({
        x: placedBox.x,
        y: topY,
        z: placedBox.z - (placedBox.depth - box.depth) / 4,
        skipGravity: true
      });
      
      // Right of placed box (same level)
      candidates.push({
        x: placedBox.x + placedBox.width / 2 + box.width / 2,
        y: placedBox.y,
        z: placedBox.z
      });
      
      // Behind placed box (same level)
      candidates.push({
        x: placedBox.x,
        y: placedBox.y,
        z: placedBox.z + placedBox.depth / 2 + box.depth / 2
      });
      
      // Corners of placed box (same level)
      const corners = [
        { dx: 1, dz: 1 },
        { dx: -1, dz: 1 },
        { dx: 1, dz: -1 },
        { dx: -1, dz: -1 }
      ];
      
      for (const corner of corners) {
        candidates.push({
          x: placedBox.x + corner.dx * (placedBox.width / 2 + box.width / 2),
          y: placedBox.y,
          z: placedBox.z + corner.dz * (placedBox.depth / 2 + box.depth / 2)
        });
      }
    }
    
    // Add a grid of positions at floor level for better coverage
    const gridSteps = 5;
    
    for (let ix = 0; ix < gridSteps; ix++) {
      for (let iz = 0; iz < gridSteps; iz++) {
        candidates.push({
          x: -container.width / 2 + (ix + 0.5) * (container.width / gridSteps),
          y: box.height / 2,
          z: -container.depth / 2 + (iz + 0.5) * (container.depth / gridSteps)
        });
      }
    }
    
    return candidates;
  }

  shuffleArray(array, seed) {
    let m = array.length, t, i;
    // Simple seeded random
    const random = () => {
        const x = Math.sin(seed++) * 10000;
        return x - Math.floor(x);
    };

    while (m) {
      i = Math.floor(random() * m--);
      t = array[m];
      array[m] = array[i];
      array[i] = t;
    }
    return array;
  }
}

// Worker interface
const worker = new PackingWorker();

self.onmessage = (e) => {
  if (e.data.type === 'start') {
    try {
      const result = worker.optimize(e.data.params);
      self.postMessage({ type: 'complete', result });
    } catch (err) {
      self.postMessage({ type: 'error', error: err.message });
    }
  }
};
