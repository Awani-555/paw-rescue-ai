import motifsUrl from '../../assets/motifs.png'

const SHEET_WIDTH = 1792
const SHEET_HEIGHT = 592
const ICON_COUNT = 3
const SLOT_WIDTH = SHEET_WIDTH / ICON_COUNT

// motifs.png is a single 1792x592 sprite sheet with three circular icons
// (camera, phone/AI, location+home) laid out side by side. Slicing it with
// background-position instead of three separate files keeps one export in
// sync as a single source image.
export default function MotifIcon({ index, size = 56 }) {
  const scale = size / SHEET_HEIGHT
  const scaledSheetWidth = SHEET_WIDTH * scale
  const scaledSlotWidth = scaledSheetWidth / ICON_COUNT

  return (
    <div
      className="motif-icon"
      style={{
        width: size,
        height: size,
        backgroundImage: `url(${motifsUrl})`,
        backgroundSize: `${scaledSheetWidth}px ${size}px`,
        backgroundPosition: `${-scaledSlotWidth * index}px 0px`,
        backgroundRepeat: 'no-repeat',
      }}
    />
  )
}
