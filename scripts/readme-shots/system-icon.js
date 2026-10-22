// Writes an app's icon as macOS draws it — the tile, its rim and shadow as in
// the Dock and Finder — rather than the raw artwork the bundle ships.
//
//   osascript -l JavaScript scripts/readme-shots/system-icon.js <app> <out.png> [pixels]
ObjC.import("AppKit");

function run(argv) {
  const [app, out, size] = argv;
  const px = Number(size || 512);

  const icon = $.NSWorkspace.sharedWorkspace.iconForFile(app);
  const rep =
    $.NSBitmapImageRep.alloc.initWithBitmapDataPlanesPixelsWidePixelsHighBitsPerSampleSamplesPerPixelHasAlphaIsPlanarColorSpaceNameBytesPerRowBitsPerPixel(
      null,
      px,
      px,
      8,
      4,
      true,
      false,
      $.NSDeviceRGBColorSpace,
      0,
      0,
    );
  $.NSGraphicsContext.saveGraphicsState;
  $.NSGraphicsContext.setCurrentContext(
    $.NSGraphicsContext.graphicsContextWithBitmapImageRep(rep),
  );
  icon.drawInRectFromRectOperationFraction(
    $.NSMakeRect(0, 0, px, px),
    $.NSZeroRect,
    $.NSCompositingOperationSourceOver,
    1.0,
  );
  $.NSGraphicsContext.restoreGraphicsState;

  const png = rep.representationUsingTypeProperties(
    $.NSBitmapImageFileTypePNG,
    $(),
  );
  if (!png.writeToFileAtomically(out, true))
    throw new Error(`could not write ${out}`);
  return `wrote ${out} (${px}x${px})`;
}
