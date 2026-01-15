export class SettingsPanel {
  constructor(container, appState) {
    this.container = container;
    this.appState = appState;
    this.isSubscribed = false;
  }
  
  render() {
    const { container, containerConstraints, boxes } = this.appState;
    const constrainedCount = this.appState.getConstrainedDimensionCount();
    
    // Calculate max box dimensions
    const maxBoxDims = {
      width: Math.max(...boxes.map(b => b.width)),
      height: Math.max(...boxes.map(b => b.height)),
      depth: Math.max(...boxes.map(b => b.depth))
    };
    
    // Check which constraints are invalid
    const invalidConstraints = this.getInvalidConstraints(containerConstraints, maxBoxDims);
    
    this.container.innerHTML = `
      <h2>Pack3D Settings</h2>
      
      <h3>Container Constraints</h3>
      <p class="help-text">Lock up to 2 dimensions. Unconstrained dimensions will be minimized.</p>
      <div class="dimension-constraints">
        <div class="constraint-group">
          <input type="checkbox" id="constrain-width" 
                 ${containerConstraints.width !== null ? 'checked' : ''}
                 ${constrainedCount >= 2 && containerConstraints.width === null ? 'disabled' : ''}>
          <label for="constrain-width">Width</label>
          <input type="number" id="container-width" 
                 value="${containerConstraints.width !== null ? containerConstraints.width : ''}" 
                 min="1" 
                 step="0.0625"
                 placeholder="Auto"
                 ${containerConstraints.width === null ? 'disabled' : ''}>
          ${invalidConstraints.width ? `<div class="constraint-warning">⚠️ Must be ≥ ${maxBoxDims.width}</div>` : ''}
        </div>
        <div class="constraint-group">
          <input type="checkbox" id="constrain-height" 
                 ${containerConstraints.height !== null ? 'checked' : ''}
                 ${constrainedCount >= 2 && containerConstraints.height === null ? 'disabled' : ''}>
          <label for="constrain-height">Height</label>
          <input type="number" id="container-height" 
                 value="${containerConstraints.height !== null ? containerConstraints.height : ''}" 
                 min="1" 
                 step="0.0625"
                 placeholder="Auto"
                 ${containerConstraints.height === null ? 'disabled' : ''}>
          ${invalidConstraints.height ? `<div class="constraint-warning">⚠️ Must be ≥ ${maxBoxDims.height}</div>` : ''}
        </div>
        <div class="constraint-group">
          <input type="checkbox" id="constrain-depth" 
                 ${containerConstraints.depth !== null ? 'checked' : ''}
                 ${constrainedCount >= 2 && containerConstraints.depth === null ? 'disabled' : ''}>
          <label for="constrain-depth">Depth</label>
          <input type="number" id="container-depth" 
                 value="${containerConstraints.depth !== null ? containerConstraints.depth : ''}" 
                 min="1" 
                 step="0.0625"
                 placeholder="Auto"
                 ${containerConstraints.depth === null ? 'disabled' : ''}>
          ${invalidConstraints.depth ? `<div class="constraint-warning">⚠️ Must be ≥ ${maxBoxDims.depth}</div>` : ''}
        </div>
      </div>
      
      ${container.width ? `
        <div class="optimized-result">
          <strong>Optimized Container:</strong> ${container.width} × ${container.height} × ${container.depth}
        </div>
      ` : ''}
      
      <h3>Boxes</h3>
      <div class="box-list" id="box-list">
        ${boxes.map(box => this.renderBoxItem(box)).join('')}
      </div>
      <button class="add-box-btn" id="add-box-btn">
        <span>+</span> Add Box
      </button>
      
      <button class="optimize-btn" id="optimize-btn" ${this.appState.isOptimizing ? 'disabled' : ''}>
        ${this.appState.isOptimizing ? 'Optimizing...' : 'Optimize Packing'}
      </button>
      
      ${this.renderStatus()}
    `;
    
    this.attachEventListeners();
  }
  
  renderBoxItem(box) {
    return `
      <div class="box-item" data-box-id="${box.id}">
        <span class="box-label">W:</span>
        <input type="number" class="box-width" value="${box.width}" min="0.0625" step="0.0625">
        
        <span class="box-label">H:</span>
        <input type="number" class="box-height" value="${box.height}" min="0.0625" step="0.0625">
        
        <span class="box-label">D:</span>
        <input type="number" class="box-depth" value="${box.depth}" min="0.0625" step="0.0625">
        
        <span class="box-label x-label">×</span>
        <input type="number" class="box-quantity" value="${box.quantity}" min="1" max="1000">
        
        <button class="remove-box-btn">×</button>
      </div>
    `;
  }
  
  renderStatus() {
    if (this.appState.optimizationStats) {
      const stats = this.appState.optimizationStats;
      const emptySpace = Math.max(0, 100 - stats.volumeUtilization).toFixed(1);
      const usedSpace = stats.volumeUtilization.toFixed(1);
      const isSuccess = stats.placedCount === stats.totalBoxes;
      
      const statusTitle = isSuccess ? 'Optimization Complete' : 'Optimization Failed';
      const statusColor = isSuccess ? '#60a5fa' : '#ef4444'; 
      const failureReason = !isSuccess ? '<div class="failure-reason">Could not fit all boxes inside constraints</div>' : '';

      return `
        <div class="status-message" style="border-left: 4px solid ${statusColor}">
          <strong style="color: ${statusColor}">${statusTitle}</strong>
          ${failureReason}
          
          <div class="stat-row">
            <span>Placed:</span>
            <span style="font-weight: bold; color: ${isSuccess ? '#fff' : '#ef4444'}">
              ${stats.placedCount}/${stats.totalBoxes}
            </span>
          </div>
          
          <div class="stat-row">
            <span>Volume Used:</span>
            <span>${usedSpace}%</span>
          </div>
          
          <div class="stat-row">
            <span>Empty Space:</span>
            <span>${emptySpace}%</span>
          </div>
          
          <div class="stat-bar-container" title="${usedSpace}% Used / ${emptySpace}% Empty">
             <div class="stat-bar-fill used" style="width: ${stats.volumeUtilization}%"></div>
             <div class="stat-bar-fill empty" style="width: ${100 - stats.volumeUtilization}%"></div>
          </div>
          
          <div class="stat-row time-row">
            <span>Time:</span>
            <span>${stats.timeMs}ms</span>
          </div>
        </div>
      `;
    }
    return '';
  }
  
  attachEventListeners() {
    // Container constraint checkboxes
    ['width', 'height', 'depth'].forEach(dim => {
      const checkbox = document.getElementById(`constrain-${dim}`);
      const input = document.getElementById(`container-${dim}`);
      
      checkbox.addEventListener('change', (e) => {
        if (e.target.checked) {
          const value = parseFloat(input.value) || 100;
          input.value = value;
          input.disabled = false;
          this.appState.updateContainerConstraints({ [dim]: value });
        } else {
          input.value = '';
          input.disabled = true;
          this.appState.updateContainerConstraints({ [dim]: null });
        }
        this.render(); // Re-render to update disabled states
      });
      
      input.addEventListener('change', (e) => {
        const value = parseFloat(e.target.value) || 100;
        this.appState.updateContainerConstraints({ [dim]: value });
      });
    });
    
    // Add box button
    document.getElementById('add-box-btn').addEventListener('click', () => {
      this.appState.addBox();
      this.render(); // Re-render to show new box
    });
    
    // Box item changes and removal
    document.querySelectorAll('.box-item').forEach(item => {
      const boxId = parseInt(item.dataset.boxId);
      
      item.querySelector('.box-width').addEventListener('change', (e) => {
        this.appState.updateBox(boxId, { width: parseFloat(e.target.value) || 1 });
      });
      
      item.querySelector('.box-height').addEventListener('change', (e) => {
        this.appState.updateBox(boxId, { height: parseFloat(e.target.value) || 1 });
      });
      
      item.querySelector('.box-depth').addEventListener('change', (e) => {
        this.appState.updateBox(boxId, { depth: parseFloat(e.target.value) || 1 });
      });
      
      item.querySelector('.box-quantity').addEventListener('change', (e) => {
        this.appState.updateBox(boxId, { quantity: parseInt(e.target.value) || 1 });
      });
      
      item.querySelector('.remove-box-btn').addEventListener('click', () => {
        this.appState.removeBox(boxId);
        this.render(); // Re-render to remove box from UI
      });
    });
    
    // Optimize button
    document.getElementById('optimize-btn').addEventListener('click', () => {
      this.handleOptimize();
    });
    
    // Subscribe to state changes for re-rendering (only once)
    if (!this.isSubscribed) {
      this.appState.subscribe(() => {
        this.render();
      });
      this.isSubscribed = true;
    }
  }
  
  getInvalidConstraints(containerConstraints, maxBoxDims) {
    return {
      width: containerConstraints.width !== null && containerConstraints.width < maxBoxDims.width,
      height: containerConstraints.height !== null && containerConstraints.height < maxBoxDims.height,
      depth: containerConstraints.depth !== null && containerConstraints.depth < maxBoxDims.depth
    };
  }
  
  async handleOptimize() {
    // Import optimizer dynamically
    const { PackingOptimizer } = await import('../packing/PackingOptimizer.js');
    const optimizer = new PackingOptimizer(this.appState);
    
    this.appState.startOptimization();
    
    // Run optimization in next tick to allow UI to update
    setTimeout(() => {
      optimizer.optimize();
    }, 50);
  }
}
