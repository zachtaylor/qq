export type CardFont =
  'serif' | 'sans' | 'slab' | 'mono' | 'condensed' | 'script'
export type CardLayout = 'center' | 'top' | 'bottom' | 'left' | 'split'
export type CardFontSize = 'sm' | 'md' | 'lg' | 'xl'

export interface CardStyle {
  background: string
  backgroundImage: string | null
  textColor: string
  accentColor: string
  font: CardFont
  authorFont: CardFont
  layout: CardLayout
  fontSize: CardFontSize
  authorFontSize: CardFontSize
}

export const LAYOUT_OPTIONS: { value: CardLayout; label: string }[] = [
  { value: 'center', label: 'Centered' },
  { value: 'top', label: 'Top' },
  { value: 'bottom', label: 'Bottom' },
  { value: 'left', label: 'Left aligned' },
  { value: 'split', label: 'Split' },
]

// Scales the auto-fit quote size and the author-line ratio. "md" matches
// the previous fixed behavior (1x quote, 0.55x author).
export const FONT_SIZE_OPTIONS: {
  value: CardFontSize
  label: string
  scale: number
}[] = [
  { value: 'sm', label: 'Small', scale: 0.75 },
  { value: 'md', label: 'Medium', scale: 1 },
  { value: 'lg', label: 'Large', scale: 1.25 },
  { value: 'xl', label: 'Extra large', scale: 1.5 },
]

function scaleFor(size: CardFontSize): number {
  return FONT_SIZE_OPTIONS.find((f) => f.value === size)?.scale ?? 1
}

export const FONT_OPTIONS: {
  value: CardFont
  label: string
  family: string
  webFont?: string
}[] = [
  {
    value: 'serif',
    label: 'Serif',
    family: 'Georgia, "Times New Roman", serif',
  },
  {
    value: 'sans',
    label: 'Sans',
    family: 'system-ui, -apple-system, "Segoe UI", sans-serif',
  },
  {
    value: 'slab',
    label: 'Slab',
    family: '"Roboto Slab", Georgia, serif',
    webFont: 'Roboto Slab',
  },
  { value: 'mono', label: 'Mono', family: '"Courier New", monospace' },
  {
    value: 'condensed',
    label: 'Condensed',
    family: '"Oswald", Arial, sans-serif',
    webFont: 'Oswald',
  },
  {
    value: 'script',
    label: 'Script',
    family: '"Caveat", cursive',
    webFont: 'Caveat',
  },
]

function fontFor(font: CardFont) {
  return FONT_OPTIONS.find((f) => f.value === font) ?? FONT_OPTIONS[0]
}

/** Self-hosted webfonts (see app.css) aren't guaranteed loaded before a
 * canvas draw — an unloaded font silently falls back with no error, which
 * is what made slab/condensed/script render as the browser default before
 * this was added. */
async function ensureFontLoaded(font: CardFont): Promise<void> {
  const webFont = fontFor(font).webFont
  if (!webFont || typeof document === 'undefined' || !document.fonts) return
  await document.fonts.load(`64px "${webFont}"`)
}

export const CARD_PRESETS: { name: string; style: CardStyle }[] = [
  {
    name: 'Paper',
    style: {
      background: '#fafaf9',
      backgroundImage: null,
      textColor: '#292524',
      accentColor: '#b45309',
      font: 'serif',
      authorFont: 'serif',
      layout: 'center',
      fontSize: 'md',
      authorFontSize: 'md',
    },
  },
  {
    name: 'Midnight',
    style: {
      background: '#1c1917',
      backgroundImage: null,
      textColor: '#fafaf9',
      accentColor: '#fbbf24',
      font: 'serif',
      authorFont: 'serif',
      layout: 'center',
      fontSize: 'md',
      authorFontSize: 'md',
    },
  },
  {
    name: 'Ocean',
    style: {
      background: '#0c4a6e',
      backgroundImage: null,
      textColor: '#f0f9ff',
      accentColor: '#38bdf8',
      font: 'sans',
      authorFont: 'sans',
      layout: 'center',
      fontSize: 'md',
      authorFontSize: 'md',
    },
  },
  {
    name: 'Blush',
    style: {
      background: '#fdf2f8',
      backgroundImage: null,
      textColor: '#831843',
      accentColor: '#db2777',
      font: 'sans',
      authorFont: 'sans',
      layout: 'center',
      fontSize: 'md',
      authorFontSize: 'md',
    },
  },
  {
    name: 'Code',
    style: {
      background: '#0a0a0a',
      backgroundImage: null,
      textColor: '#4ade80',
      accentColor: '#22d3ee',
      font: 'mono',
      authorFont: 'mono',
      layout: 'left',
      fontSize: 'md',
      authorFontSize: 'md',
    },
  },
  {
    name: 'Sunset',
    style: {
      background: 'linear-gradient(160deg, #f97316, #db2777)',
      backgroundImage: null,
      textColor: '#fff7ed',
      accentColor: '#fde68a',
      font: 'slab',
      authorFont: 'slab',
      layout: 'center',
      fontSize: 'md',
      authorFontSize: 'md',
    },
  },
  {
    name: 'Forest',
    style: {
      background: '#14532d',
      backgroundImage: null,
      textColor: '#ecfdf5',
      accentColor: '#86efac',
      font: 'serif',
      authorFont: 'sans',
      layout: 'bottom',
      fontSize: 'md',
      authorFontSize: 'md',
    },
  },
  {
    name: 'Royal',
    style: {
      background: 'linear-gradient(135deg, #312e81, #6d28d9)',
      backgroundImage: null,
      textColor: '#f5f3ff',
      accentColor: '#facc15',
      font: 'script',
      authorFont: 'sans',
      layout: 'split',
      fontSize: 'md',
      authorFontSize: 'md',
    },
  },
]

const WIDTH = 1080
const HEIGHT = 1080

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line)
      line = word
    } else {
      line = test
    }
  }
  if (line) lines.push(line)
  return lines
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

const GRADIENT_RE = /^linear-gradient\(\s*([\d.]+)deg\s*,\s*(.+)\)$/i

/** Canvas fillStyle doesn't understand CSS gradient syntax directly — parse
 * a simple `linear-gradient(<deg>deg, color, color, ...)` string (the kind
 * users can type into the background field) into a CanvasGradient. Falls
 * back to solid fill for anything else (hex, rgb(), named colors, or a
 * gradient string we don't recognize — canvas just no-ops on an invalid
 * fillStyle rather than throwing, so this never crashes the render). */
function applyBackgroundFill(ctx: CanvasRenderingContext2D, value: string) {
  const match = value.trim().match(GRADIENT_RE)
  if (!match) {
    ctx.fillStyle = value
    ctx.fillRect(0, 0, WIDTH, HEIGHT)
    return
  }

  const angle = (parseFloat(match[1]) * Math.PI) / 180
  const stops = match[2]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  // Project a line through the canvas center at `angle` (CSS gradient
  // convention: 0deg points up, increasing clockwise).
  const cx = WIDTH / 2
  const cy = HEIGHT / 2
  const dx = Math.sin(angle)
  const dy = -Math.cos(angle)
  const len = Math.abs(dx) * WIDTH + Math.abs(dy) * HEIGHT
  const x0 = cx - (dx * len) / 2
  const y0 = cy - (dy * len) / 2
  const x1 = cx + (dx * len) / 2
  const y1 = cy + (dy * len) / 2

  const gradient = ctx.createLinearGradient(x0, y0, x1, y1)
  stops.forEach((stop, i) => {
    gradient.addColorStop(stops.length === 1 ? 0 : i / (stops.length - 1), stop)
  })
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, WIDTH, HEIGHT)
}

function drawBackgroundImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
) {
  // cover-fit, centered
  const scale = Math.max(WIDTH / img.width, HEIGHT / img.height)
  const w = img.width * scale
  const h = img.height * scale
  ctx.drawImage(img, (WIDTH - w) / 2, (HEIGHT - h) / 2, w, h)
  // scrim so text stays legible over arbitrary photos
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)'
  ctx.fillRect(0, 0, WIDTH, HEIGHT)
}

const MARGIN = 100

/** Vertical band (as [top, bottom] in px) the quote block should center
 * within, per layout. "left" keeps a centered band but switches text
 * alignment; "split" pins the quote high and the author low instead of
 * stacking them together. */
function bandFor(layout: CardLayout): [number, number] {
  switch (layout) {
    case 'top':
      return [MARGIN, MARGIN + 520]
    case 'bottom':
      return [HEIGHT - MARGIN - 520, HEIGHT - MARGIN]
    default:
      return [MARGIN, HEIGHT - MARGIN]
  }
}

export async function renderCard(
  canvas: HTMLCanvasElement,
  quote: { text: string; authorName: string },
  style: CardStyle,
  signal?: { cancelled: boolean },
) {
  await ensureFontLoaded(style.font)
  await ensureFontLoaded(style.authorFont)
  const bgImage = style.backgroundImage
    ? await loadImage(style.backgroundImage).catch(() => null)
    : null
  if (signal?.cancelled) return

  canvas.width = WIDTH
  canvas.height = HEIGHT
  const ctx = canvas.getContext('2d')!

  if (bgImage) {
    drawBackgroundImage(ctx, bgImage)
  } else {
    applyBackgroundFill(ctx, style.background)
  }

  const quoteFontFamily = fontFor(style.font).family
  const authorFontFamily = fontFor(style.authorFont).family
  const textAlign: CanvasTextAlign = style.layout === 'left' ? 'left' : 'center'
  const textX = textAlign === 'left' ? MARGIN : WIDTH / 2
  const maxTextWidth = textAlign === 'left' ? WIDTH - MARGIN - 80 : WIDTH - 200

  const quoteScale = scaleFor(style.fontSize)
  const authorScale = scaleFor(style.authorFontSize)

  let baseFontSize = 64 * quoteScale
  let lines: string[] = []
  const [bandTop, bandBottom] = bandFor(style.layout)
  const bandHeight = bandBottom - bandTop
  do {
    ctx.font = `${baseFontSize}px ${quoteFontFamily}`
    lines = wrapText(ctx, `“${quote.text}”`, maxTextWidth)
    if (lines.length * (baseFontSize * 1.35) < bandHeight - 120) break
    baseFontSize -= 4
  } while (baseFontSize > 24 * quoteScale)

  const fontSize = baseFontSize
  const lineHeight = fontSize * 1.35
  const authorPx = Math.round(fontSize * 0.55 * (authorScale / quoteScale))
  const authorGap = lineHeight * 0.3

  ctx.textAlign = textAlign
  ctx.textBaseline = 'middle'

  if (style.layout === 'split') {
    // Quote block sits in the top band, author sits in the bottom band,
    // independently of each other.
    const quoteHeight = lines.length * lineHeight
    let y = bandTop + quoteHeight / 2 - lineHeight / 2 + fontSize / 2
    ctx.fillStyle = style.textColor
    for (const line of lines) {
      ctx.fillText(line, textX, y)
      y += lineHeight
    }
    ctx.font = `${authorPx}px ${authorFontFamily}`
    ctx.fillStyle = style.accentColor
    ctx.fillText(`— ${quote.authorName}`, textX, HEIGHT - MARGIN)
  } else {
    const totalHeight = lines.length * lineHeight + authorGap + authorPx
    let y = bandTop + (bandHeight - totalHeight) / 2 + fontSize / 2
    ctx.fillStyle = style.textColor
    for (const line of lines) {
      ctx.fillText(line, textX, y)
      y += lineHeight
    }
    ctx.font = `${authorPx}px ${authorFontFamily}`
    ctx.fillStyle = style.accentColor
    ctx.fillText(`— ${quote.authorName}`, textX, y + authorGap)
  }
}

/** Downscales an uploaded image to roughly the card's resolution before
 * turning it into a data URL — keeps memory/localStorage usage sane for
 * photos straight off a phone camera (which can be 10+ MB). */
export async function fileToBackgroundImage(file: File): Promise<string> {
  const img = await loadImage(URL.createObjectURL(file))
  const scale = Math.min(1, Math.max(WIDTH / img.width, HEIGHT / img.height))
  const w = Math.round(img.width * scale)
  const h = Math.round(img.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0, w, h)
  return canvas.toDataURL('image/jpeg', 0.85)
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))),
      'image/png',
    )
  })
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export async function shareCardImage(
  canvas: HTMLCanvasElement,
  filename = 'quote.png',
) {
  const blob = await canvasToBlob(canvas)

  const { Capacitor } = await import('@capacitor/core')
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem')
    const { Share } = await import('@capacitor/share')
    const base64 = await blobToBase64(blob)
    const result = await Filesystem.writeFile({
      path: filename,
      data: base64,
      directory: Directory.Cache,
    })
    await Share.share({ url: result.uri })
    return
  }

  const file = new File([blob], filename, { type: 'image/png' })
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file] })
    return
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
