// This worker handles the CPU-intensive packing optimization
import { PhysicsSolver } from '../physics/PhysicsSolver.js';

export class PackingWorker {
  constructor() {
    this.physicsSolver = new PhysicsSolver();
    this.postMessage = (typeof self !== 'undefined' && self.postMessage) 
      ? self.postMessage.bind(self) 
      : () => {}; // No-op if not in worker context
  }

  optimize(data) {
    const { boxes, constraints, allowRotation, maxAttempts, monteCarloConfig } = data;
    this.allowRotation = allowRotation;
    
    // Configuration for algorithm depth
    this.mcConfig = monteCarloConfig || {
       searchAttempts: 15, // High depth (Monte Carlo)
       finalAttempts: 10,
       useNoise: true
    };
    
    const startTime = performance.now();
    
    // Report start
    this.postMessage({ type: 'progress', message: 'Initializing optimization...', progress: 0 });

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
      // Reduce initial buffer from 1.5 to 1.1 for tighter starting estimates
      const volumePerDim = Math.pow((totalVolume * 1.1) / constrainedVolume, 1 / unconstrainedDims.length);
      
      unconstrainedDims.forEach(dim => {
        currentContainer[dim] = Math.max(maxBoxDims[dim], Math.ceil(volumePerDim));
      });
    }

    // Binary search on each unconstrained dimension
    let dimIndex = 0;
    const totalDimProgressRange = 40; // 10% to 50%
    const dimRange = totalDimProgressRange / unconstrainedDims.length;
    
    for (const dim of unconstrainedDims) {
      const dimStartProgress = 10 + (dimIndex * dimRange);
      dimIndex++;
      
      this.postMessage({ 
        type: 'progress', 
        message: `Optimizing dimension: ${dim}...`, 
        progress: Math.floor(dimStartProgress)
      });
      
      currentContainer[dim] = this.binarySearchDimension(
        boxes,
        currentContainer,
        dim,
        maxBoxDims[dim],
        Math.max(currentContainer[dim] * 3, maxBoxDims[dim] * 5),
        dimStartProgress,
        dimRange
      );
    }
    
    this.postMessage({ type: 'progress', message: 'Finalizing packing (Monte Carlo)...', progress: 50 });

    // Final optimization attempt with found dimensions
    // Try multiple seeds and pick best
    let bestPlaced = [];
    // Loop based on config
    const iterations = this.mcConfig.finalAttempts;
    
    for(let i=0; i < iterations; i++) {
       this.postMessage({ 
           type: 'progress', 
           message: `Finalizing packing (Seed ${i+1}/${iterations})...`, 
           progress: 50 + Math.floor((i / iterations) * 10)
       });

       const p = this.attemptPacking(boxes, currentContainer, i);
       if(p.length > bestPlaced.length) bestPlaced = p;
       if(bestPlaced.length === boxes.length) break;
    }
    let placedBoxes = bestPlaced;
    
    // Iterative expansion logic
    if (placedBoxes.length < boxes.length && unconstrainedDims.length > 0) {
      let attempts = 0;
      const MAX_EXPANSION_ATTEMPTS = 20;
      
      while (placedBoxes.length < boxes.length && attempts < MAX_EXPANSION_ATTEMPTS) {
        attempts++;
        this.postMessage({ 
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
        
        // Expansion uses simple single attempt to be fast? Or should it use MC?
        // Let's stick to single attempt for expansion to avoid being too slow, 
        // or maybe a small number. Original code used attemptPacking(..., 0).
        // Let's use config.
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

    this.postMessage({ type: 'progress', message: 'Done!', progress: 100 });
    return { container: currentContainer, placedBoxes };
  }

  binarySearchDimension(boxes, baseContainer, searchDim, minValue, maxValue, progressBase, progressRange) {
    const epsilon = 0.05; 
    let low = minValue;
    let high = maxValue;
    let bestFit = high;
    const initialRange = high - low;
    
    while (high - low > epsilon) {
      const mid = (low + high) / 2;
      
      // Update granular progress
      if (progressBase !== undefined && progressRange !== undefined && initialRange > 0) {
           const currentRange = high - low;
           const percentComplete = 1 - (currentRange / initialRange);
           const currentProgress = progressBase + (percentComplete * progressRange);
           
           this.postMessage({
               type: 'progress', 
               message: `Optimizing ${searchDim}: ${mid.toFixed(1)}...`,
               progress: Math.floor(currentProgress)
           });
      }

      const testContainer = { ...baseContainer, [searchDim]: mid };
      
      let success = false;
      // Monte Carlo Sampling or Single Pass
      const attempts = this.mcConfig.searchAttempts; // 15 or 3
      
      for (let attempt = 0; attempt < attempts; attempt++) {
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
    const boxList = [...boxes];
    
    // Deterministic Random Generator based on seed
    const random = () => {
        const x = Math.sin(seed + 1) * 10000;
        seed++;
        return x - Math.floor(x);
    };

    // Calculate Sort Key with Noise (Monte Carlo)
    // If seed is 0, noise is 0 -> Pure Deterministic Volume Sort
    const getScore = (box) => {
        const volume = box.width * box.height * box.depth;
        
        // Use config for noise
        const useNoise = this.mcConfig.useNoise;
        const noise = (useNoise && seed > 0) ? (random() * 0.4 - 0.2) : 0;
        
        return volume * (1 + noise);
    };

    boxList.sort((a, b) => {
      return getScore(b) - getScore(a);
    });
    
    const placedBoxes = [];
    
    for (const box of boxList) {
      const placement = this.findPlacement(box, placedBoxes, container, seed);
      if (placement) {
        placedBoxes.push(placement);
      }
    }
    
    return placedBoxes;
  }

  findPlacement(box, placedBoxes, container, seed) {
    let candidates = [];
    
    const orientations = this.allowRotation ? this.getUniqueOrientations(box) : [box];

    for (const orientation of orientations) {
      // Treat orientation like a box (has width, height, depth)
      const orientationCandidates = this.generateCandidatePositions(orientation, placedBoxes, container);
      
      // Tag candidates with the dimensions used to generate them
      orientationCandidates.forEach(c => {
        c.width = orientation.width;
        c.height = orientation.height;
        c.depth = orientation.depth;
      });
      
      candidates = candidates.concat(orientationCandidates);
    }
    
    // Sort candidates: Bottom-Back-Left preference
    // We remove random shuffling to ensure tightest corner packing
    candidates.sort((a, b) => {
      const epsilon = 0.001;
      // 1. Gravity (lowest Y)
      if (Math.abs(a.y - b.y) > epsilon) return a.y - b.y;
      
      // 2. Back-to-Front (lowest Z) - creates rows
      if (Math.abs(a.z - b.z) > epsilon) return a.z - b.z;
      
      // 3. Left-to-Right (lowest X)
      if (Math.abs(a.x - b.x) > epsilon) return a.x - b.x;
      
      return 0;
    });

    for (const candidate of candidates) {
      const testBox = {
        ...box,
        x: candidate.x,
        y: candidate.y,
        z: candidate.z,
        // Apply rotation dimensions
        width: candidate.width,
        height: candidate.height,
        depth: candidate.depth
      };
      
      // Gravity / Drop Logic preserved from original
      if (candidate.y > testBox.height && !candidate.skipGravity) {
        testBox.y = this.physicsSolver.dropBox(testBox, placedBoxes, container);
      }
      
      if (this.physicsSolver.isValidPlacement(testBox, placedBoxes, container, 0.2)) {
        return testBox;
      }
    }
    
    return null;
  }

  getUniqueOrientations(box) {
    const { width: w, height: h, depth: d } = box;
    const permutations = [
      { width: w, height: h, depth: d },
      { width: w, height: d, depth: h },
      { width: h, height: w, depth: d },
      { width: h, height: d, depth: w },
      { width: d, height: w, depth: h },
      { width: d, height: h, depth: w }
    ];
    
    // Filter duplicates
    const seen = new Set();
    const unique = [];
    
    for (const p of permutations) {
      const key = `${p.width},${p.height},${p.depth}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(p);
      }
    }
    
    return unique;
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

if (typeof self !== 'undefined') {
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
}
