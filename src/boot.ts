// The page's entry: the game itself (index.ts) only when the browser can draw it. The map is drawn with WebGL (its
// ground is one GPU layer); without it, Phaser fell back to its canvas renderer, which can't draw that layer, and
// the game died on its first frame with a blank screen. (WebGL off in the browser's settings, a graphics driver it
// won't use, or a privacy-hardened browser that turns it off.)
import './ui/styles.css';

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

function explain(): void {
  const box = document.createElement('div');
  box.className = 'title-screen';
  box.innerHTML = `
    <div class="panel title-panel" role="alert">
      <h1>Colony Alpha</h1>
      <p>This browser can't draw the game's map: it needs WebGL, which is turned off here, or isn't available for
      this graphics card.</p>
      <p class="muted">Turning on hardware acceleration in the browser's settings usually brings it back, or the game
      runs in another browser (any recent Chrome, Edge, Firefox or Safari).</p>
    </div>`;
  document.getElementById('ui')?.append(box);
}

if (hasWebGL()) {
  void import('./index');
} else {
  explain();
}
