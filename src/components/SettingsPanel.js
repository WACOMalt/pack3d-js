export class SettingsPanel {
  constructor(container, appState) {
    this.container = container;
    this.appState = appState;
    this.isSubscribed = false;
    // UI State for collapsible sections
    this.uiState = {
      constraintsOpen: true,
      optimizationOpen: true,
      boxesOpen: true
    };
    
    // Cache for structural change detection
    this.lastRenderState = {
      boxCount: 0,
      uiStateJSON: ''
    };
  }
  
  render() {
    const { boxes } = this.appState;
    
    // Check if we need a full re-render (structure changed) or just an update (values changed)
    const currentRenderState = {
      boxCount: boxes.length,
      uiStateJSON: JSON.stringify(this.uiState)
    };
    
    const needsFullRender = 
      currentRenderState.boxCount !== this.lastRenderState.boxCount ||
      currentRenderState.uiStateJSON !== this.lastRenderState.uiStateJSON ||
      !this.container.hasChildNodes(); // First run
      
    if (needsFullRender) {
      this.fullRender();
      this.lastRenderState = currentRenderState;
    } else {
      this.updateValues();
    }
  }

  fullRender() {
    // Capture focus before re-rendering
    const focusedEl = document.activeElement;
    const focusedId = focusedEl ? focusedEl.id : null;
    
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

      <div class="optimized-result" style="margin-bottom: 12px; margin-top: 0; background-color: ${this.appState.optimizationStats ? '#1e3a5f' : '#2a2a2a'}; border-color: ${this.appState.optimizationStats ? '#3b82f6' : '#4a4a4a'};">
        ${this.appState.optimizationStats ? 
          `<strong>Optimized Container:</strong> ${container.width} × ${container.height} × ${container.depth}` :
          `<span style="color: #9ca3af; font-style: italic;">Click Optimize to find the best box size</span>`
        }
      </div>

      <button class="optimize-btn" id="optimize-btn" ${this.appState.isOptimizing ? 'disabled' : ''} 
              style="margin-bottom: 20px;">
        ${this.appState.isOptimizing ? 'Optimizing...' : 'Optimize Packing'}
      </button>

      <div class="section-header ${this.uiState.boxesOpen ? '' : 'collapsed'}" id="toggle-boxes">
        <h3>Boxes</h3>
        <span class="toggle-icon">▼</span>
      </div>

      <div class="collapsible-content ${this.uiState.boxesOpen ? '' : 'collapsed'}">
        <div class="box-list" id="box-list">
          ${boxes.map(box => this.renderBoxItem(box)).join('')}
        </div>
        <button class="add-box-btn" id="add-box-btn">
          <span>+</span> Add Box
        </button>
        
        <button class="clear-boxes-btn" id="clear-boxes-btn" style="margin-top: 8px; background-color: #ef4444; width: 100%; padding: 10px; border: none; border-radius: 4px; color: white; cursor: pointer; font-weight: bold;">
          Clear All Boxes
        </button>
      </div>
      
      <div class="section-header ${this.uiState.constraintsOpen ? '' : 'collapsed'}" id="toggle-constraints">
        <h3>Container Size</h3>
        <span class="toggle-icon">▼</span>
      </div>
      
      <div class="collapsible-content ${this.uiState.constraintsOpen ? '' : 'collapsed'}" id="constraints-content">
        <p class="help-text">Lock dimensions to constrain size. Unlocked = Auto.</p>
        <div class="container-size-row">
          <span class="box-label">W:</span>
          <input type="number" id="container-width" 
                 value="${containerConstraints.width !== null ? containerConstraints.width : ''}" 
                 min="1" 
                 step="0.0625"
                 placeholder="Auto"
                 ${containerConstraints.width === null ? 'disabled' : ''}>
          <button class="constraint-lock ${containerConstraints.width !== null ? 'locked' : ''}" 
                  id="constrain-width-btn" 
                  title="Toggle Width Constraint">
            ${containerConstraints.width !== null ? '🔒' : '🔓'}
          </button>
          
          <span class="box-label">H:</span>
          <input type="number" id="container-height" 
                 value="${containerConstraints.height !== null ? containerConstraints.height : ''}" 
                 min="1" 
                 step="0.0625"
                 placeholder="Auto"
                 ${containerConstraints.height === null ? 'disabled' : ''}>
          <button class="constraint-lock ${containerConstraints.height !== null ? 'locked' : ''}" 
                  id="constrain-height-btn" 
                  title="Toggle Height Constraint">
            ${containerConstraints.height !== null ? '🔒' : '🔓'}
          </button>

          <span class="box-label">D:</span>
          <input type="number" id="container-depth" 
                 value="${containerConstraints.depth !== null ? containerConstraints.depth : ''}" 
                 min="1" 
                 step="0.0625"
                 placeholder="Auto"
                 ${containerConstraints.depth === null ? 'disabled' : ''}>
          <button class="constraint-lock ${containerConstraints.depth !== null ? 'locked' : ''}" 
                  id="constrain-depth-btn" 
                  title="Toggle Depth Constraint">
            ${containerConstraints.depth !== null ? '🔒' : '🔓'}
          </button>
        </div>

        <div class="constraint-warnings" id="constraint-warnings">
          ${invalidConstraints.width ? `<div class="warning-msg">W must be ≥ ${maxBoxDims.width}</div>` : ''}
          ${invalidConstraints.height ? `<div class="warning-msg">H must be ≥ ${maxBoxDims.height}</div>` : ''}
          ${invalidConstraints.depth ? `<div class="warning-msg">D must be ≥ ${maxBoxDims.depth}</div>` : ''}
        </div>
      </div>
      
      <div class="section-header ${this.uiState.optimizationOpen ? '' : 'collapsed'}" id="toggle-optimization">
        <h3>Optimization</h3>
        <span class="toggle-icon">▼</span>
      </div>

      <div class="collapsible-content ${this.uiState.optimizationOpen ? '' : 'collapsed'}">
        <div class="constraint-group">
          <input type="checkbox" id="allow-rotation" ${this.appState.allowRotation ? 'checked' : ''}>
          <label for="allow-rotation">Allow Box Rotation (90° steps)</label>
        </div>
      </div>
      
      <div id="status-container">
        ${this.renderStatus()}
      </div>
    `;
    
    this.attachEventListeners();
    
    // Restore focus if it was on an element that still exists
    if (focusedId) {
      const el = document.getElementById(focusedId);
      if (el) {
        el.focus();
      }
    }
  }

  updateValues() {
    const { container, containerConstraints, boxes } = this.appState;
    const activeId = document.activeElement ? document.activeElement.id : null;

    // Update Optimization Result
    const sortedResult = document.querySelector('.optimized-result');
    if (sortedResult) {
       sortedResult.style.backgroundColor = this.appState.optimizationStats ? '#1e3a5f' : '#2a2a2a';
       sortedResult.style.borderColor = this.appState.optimizationStats ? '#3b82f6' : '#4a4a4a';
       sortedResult.innerHTML = this.appState.optimizationStats ? 
          `<strong>Optimized Container:</strong> ${container.width} × ${container.height} × ${container.depth}` :
          `<span style="color: #9ca3af; font-style: italic;">Click Optimize to find the best box size</span>`;
    }

    // Update Optimize Button
    const optBtn = document.getElementById('optimize-btn');
    if (optBtn) {
       optBtn.disabled = this.appState.isOptimizing;
       optBtn.textContent = this.appState.isOptimizing ? 'Optimizing...' : 'Optimize Packing';
    }

    // Update Box Inputs
    boxes.forEach(box => {
      ['width', 'height', 'depth', 'quantity'].forEach(field => {
        const id = `box-${box.id}-${field}`;
        const input = document.getElementById(id);
        // Only update if not currently focused to avoid interfering with typing
        // Although listeners set state on change (blur/enter), so typing shouldn't be out of sync
        if (input && document.activeElement !== input) {
            input.value = box[field];
        }
      });
    });

    // Update Container Constraints
    ['width', 'height', 'depth'].forEach(dim => {
       const input = document.getElementById(`container-${dim}`);
       const btn = document.getElementById(`constrain-${dim}-btn`);
       const val = containerConstraints[dim];
       
       if (input) {
         if (val !== null) {
            if (document.activeElement !== input) input.value = val;
            input.disabled = false;
         } else {
            input.value = '';
            input.disabled = true;
         }
       }
       if (btn) {
         if (val !== null) {
            btn.classList.add('locked');
            btn.innerHTML = '🔒';
         } else {
            btn.classList.remove('locked');
            btn.innerHTML = '🔓';
         }
       }
    });

    // Update Warnings
    const maxBoxDims = {
      width: Math.max(...boxes.map(b => b.width)),
      height: Math.max(...boxes.map(b => b.height)),
      depth: Math.max(...boxes.map(b => b.depth))
    };
    const invalidConstraints = this.getInvalidConstraints(containerConstraints, maxBoxDims);
    const warningsContainer = document.getElementById('constraint-warnings');
    if (warningsContainer) {
       warningsContainer.innerHTML = `
          ${invalidConstraints.width ? `<div class="warning-msg">W must be ≥ ${maxBoxDims.width}</div>` : ''}
          ${invalidConstraints.height ? `<div class="warning-msg">H must be ≥ ${maxBoxDims.height}</div>` : ''}
          ${invalidConstraints.depth ? `<div class="warning-msg">D must be ≥ ${maxBoxDims.depth}</div>` : ''}
       `;
    }
    
    // Update Rotation
    const rotCheck = document.getElementById('allow-rotation');
    if (rotCheck) {
        rotCheck.checked = this.appState.allowRotation;
    }
    
    // Update Status
    const statusContainer = document.getElementById('status-container');
    if (statusContainer) {
        statusContainer.innerHTML = this.renderStatus();
    }
  }
  
  renderBoxItem(box) {
    return `
      <div class="box-item" data-box-id="${box.id}">
        <span class="box-label">W:</span>
        <input type="number" id="box-${box.id}-width" class="box-width" value="${box.width}" min="0.0625" step="0.0625">
        
        <span class="box-label">H:</span>
        <input type="number" id="box-${box.id}-height" class="box-height" value="${box.height}" min="0.0625" step="0.0625">
        
        <span class="box-label">D:</span>
        <input type="number" id="box-${box.id}-depth" class="box-depth" value="${box.depth}" min="0.0625" step="0.0625">
        
        <span class="box-label x-label">×</span>
        <input type="number" id="box-${box.id}-quantity" class="box-quantity" value="${box.quantity}" min="1" max="1000">
        
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
    // Toggle Collapse Handlers
    const toggleConstraints = document.getElementById('toggle-constraints');
    if (toggleConstraints) {
      toggleConstraints.addEventListener('click', () => {
        this.uiState.constraintsOpen = !this.uiState.constraintsOpen;
        this.render(); // Re-render to update classes
      });
    }

    const toggleOptimization = document.getElementById('toggle-optimization');
    if (toggleOptimization) {
      toggleOptimization.addEventListener('click', () => {
        this.uiState.optimizationOpen = !this.uiState.optimizationOpen;
        this.render();
      });
    }

    const toggleBoxes = document.getElementById('toggle-boxes');
    if (toggleBoxes) {
      toggleBoxes.addEventListener('click', () => {
        this.uiState.boxesOpen = !this.uiState.boxesOpen;
        this.render();
      });
    }

    // Container constraint locks
    ['width', 'height', 'depth'].forEach(dim => {
      const btn = document.getElementById(`constrain-${dim}-btn`);
      const input = document.getElementById(`container-${dim}`);
      
      if (btn && input) {
        btn.addEventListener('click', () => {
          const currentVal = this.appState.containerConstraints[dim];
          
          if (currentVal !== null) {
            // Currently locked, so unlock
            this.appState.updateContainerConstraints({ [dim]: null });
          } else {
            // Currently unlocked, so lock
            let newVal = parseFloat(input.value);
            if (isNaN(newVal)) {
              // Default values if empty
              if (dim === 'width') newVal = 20;
              else if (dim === 'height') newVal = 10;
              else if (dim === 'depth') newVal = 20;
              else newVal = 20;
            }
            
            this.appState.updateContainerConstraints({ [dim]: newVal });
          }
          this.render();
        });
        
        input.addEventListener('change', (e) => {
          const value = parseFloat(e.target.value) || 100;
          this.appState.updateContainerConstraints({ [dim]: value });
        });
      }
    });
    
    // Rotation toggle
    const rotationCheckbox = document.getElementById('allow-rotation');
    if (rotationCheckbox) {
      rotationCheckbox.addEventListener('change', (e) => {
        this.appState.setAllowRotation(e.target.checked);
      });
    }

    // Add box button
    document.getElementById('add-box-btn').addEventListener('click', () => {
      this.appState.addBox();
      this.render(); // Re-render to show new box
    });
    
    // Clear boxes button
    const clearBtn = document.getElementById('clear-boxes-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to clear all boxes?')) {
          this.appState.clearBoxes();
          this.render();
        }
      });
    }

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
