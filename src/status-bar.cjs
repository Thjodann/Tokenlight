// Native menu bar ownership and main-window recovery, separate from kiosk windows.
function mainDashboardOpener({ getWindow, createWindow }) {
  let pending;
  return async () => {
    if (pending) return pending;
    const current = getWindow();
    if (current && !current.isDestroyed()) {
      if (current.isMinimized()) current.restore();
      current.show(); current.focus();
      return;
    }
    pending = Promise.resolve().then(createWindow).then(entry => {
      if (!entry.window.isDestroyed()) { entry.window.show(); entry.window.focus(); }
    });
    try { await pending; } finally { pending = null; }
  };
}

function createStatusBar({ app, Tray, Menu, nativeImage, openDashboard, updateItems = () => [], platform = process.platform }) {
  if (platform !== 'darwin') return null;
  const image = nativeImage.createEmpty();
  for (const [index, png] of require('./status-icon.cjs').entries()) {
    image.addRepresentation({ scaleFactor: index + 1, dataURL: `data:image/png;base64,${png}` });
  }
  image.setTemplateImage(true);
  const tray = new Tray(image);
  tray.setToolTip('Tokenlight');
  tray.updateMenu = () => tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Dashboard', click: () => { void openDashboard().catch(() => {}); } },
    { type: 'separator' },
    ...updateItems(),
    { label: 'Quit Tokenlight', click: () => app.quit() }
  ]));
  tray.updateMenu();
  app.once('will-quit', () => tray.destroy());
  return tray;
}

module.exports = { mainDashboardOpener, createStatusBar };
