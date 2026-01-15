export class PackingOptimizer {
  constructor(appState) {
    this.appState = appState;
  }
  
  optimize() {
    const boxes = this.appState.getExpandedBoxes();
    const constraints = this.appState.containerConstraints;
    
    // Create status modal
    let modal = document.querySelector('.optimization-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.className = 'optimization-modal';
        document.body.appendChild(modal);
    }
    
    modal.style.display = 'flex';
    requestAnimationFrame(() => modal.style.opacity = '1');
    
    modal.innerHTML = `
      <div class="optimization-content">
        <h3>Optimizing Layout...</h3>
        <p id="opt-status-text">Initializing...</p>
        <div class="progress-bar">
          <div class="progress-fill" id="opt-progress" style="width: 0%"></div>
        </div>
      </div>
    `;
    
    // Create Worker
    const worker = new Worker(new URL('./optimizer.worker.js', import.meta.url), { type: 'module' });
    
    worker.onmessage = (e) => {
      const { type, message, progress, result, error } = e.data;
      
      if (type === 'progress') {
        const textEl = document.getElementById('opt-status-text');
        const fillEl = document.getElementById('opt-progress');
        if (textEl) textEl.textContent = message;
        if (fillEl) fillEl.style.width = `${progress}%`;
      }
      
      if (type === 'complete' || type === 'error') {
        // Cleanup UI
        setTimeout(() => {
            modal.style.opacity = '0';
            setTimeout(() => {
              if (modal.parentNode) modal.remove();
            }, 300);
        }, 500);
        
        worker.terminate();

        if (type === 'error' || (result && !result.success)) {
            console.error(error || (result && result.error));
            this.appState.setPlacedBoxes([], {
                placedCount: 0,
                totalBoxes: boxes.length,
                volumeUtilization: 0,
                timeMs: 0,
                error: typeof error === 'string' ? error : (result && result.error) || 'Unknown error'
            });
            return;
        }

        // Apply results
        this.appState.updateContainer(result.container);
        
        // Stats
        const totalBoxes = boxes.length;
        const placedCount = result.placedBoxes.length;
        const placedBoxVolume = result.placedBoxes.reduce((sum, box) => 
            sum + (box.width * box.height * box.depth), 0);
        const containerVolume = result.container.width * result.container.height * result.container.depth;
        const volumeUtilization = (placedBoxVolume / containerVolume) * 100;

        const stats = {
          placedCount,
          totalBoxes,
          volumeUtilization,
          timeMs: result.executionTime,
          containerSize: `${result.container.width} × ${result.container.height} × ${result.container.depth}`
        };
        
        this.appState.setPlacedBoxes(result.placedBoxes, stats);
      }
    };
    
    // Start worker
    worker.postMessage({
      type: 'start',
      params: {
        boxes,
        constraints,
        maxAttempts: 3
      }
    });
  }
}
