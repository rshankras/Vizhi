import AppKit
import Foundation

let outputDirectory = URL(fileURLWithPath: CommandLine.arguments.dropFirst().first ?? "VizhiPlugin/src/Resources/icons", isDirectory: true)
let iconSize = 192
let bounds = NSRect(x: 0, y: 0, width: iconSize, height: iconSize)
let background = NSColor.black
let green = NSColor(calibratedRed: 0.13, green: 0.77, blue: 0.37, alpha: 1)
let teal = NSColor(calibratedRed: 0.18, green: 0.80, blue: 0.76, alpha: 1)
let blue = NSColor(calibratedRed: 0.38, green: 0.65, blue: 0.98, alpha: 1)
let purple = NSColor(calibratedRed: 0.65, green: 0.55, blue: 0.98, alpha: 1)
let amber = NSColor(calibratedRed: 0.98, green: 0.75, blue: 0.14, alpha: 1)
let red = NSColor(calibratedRed: 0.97, green: 0.44, blue: 0.44, alpha: 1)

try FileManager.default.createDirectory(at: outputDirectory, withIntermediateDirectories: true)

func writeIcon(named name: String, draw: () -> Void) throws {
    let representation = NSBitmapImageRep(
        bitmapDataPlanes: nil,
        pixelsWide: iconSize,
        pixelsHigh: iconSize,
        bitsPerSample: 8,
        samplesPerPixel: 4,
        hasAlpha: true,
        isPlanar: false,
        colorSpaceName: .deviceRGB,
        bytesPerRow: 0,
        bitsPerPixel: 0
    )!
    let context = NSGraphicsContext(bitmapImageRep: representation)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = context
    background.setFill()
    bounds.fill()
    draw()
    context.flushGraphics()
    NSGraphicsContext.restoreGraphicsState()
    try representation.representation(using: .png, properties: [:])!.write(to: outputDirectory.appendingPathComponent("\(name).png"))
}

func roundStroke(_ path: NSBezierPath, color: NSColor, width: CGFloat) {
    color.setStroke()
    path.lineCapStyle = .round
    path.lineJoinStyle = .round
    path.lineWidth = width
}

func drawReady() {
    let prompt = NSBezierPath()
    prompt.move(to: NSPoint(x: 48, y: 137))
    prompt.line(to: NSPoint(x: 88, y: 96))
    prompt.line(to: NSPoint(x: 48, y: 55))
    prompt.move(to: NSPoint(x: 108, y: 55))
    prompt.line(to: NSPoint(x: 148, y: 55))
    roundStroke(prompt, color: teal, width: 18)
    prompt.stroke()
}

func drawBusy(frame: Int) {
    let spinner = NSBezierPath()
    let start = CGFloat(-55 + (frame * 90))
    spinner.appendArc(withCenter: NSPoint(x: 96, y: 96), radius: 57, startAngle: start, endAngle: start + 275, clockwise: false)
    roundStroke(spinner, color: purple, width: 20)
    spinner.stroke()
}

func drawAlert(_ color: NSColor, pulseOpacity: CGFloat) {
    let halo = NSBezierPath(ovalIn: NSRect(x: 13, y: 13, width: 166, height: 166))
    roundStroke(halo, color: color.withAlphaComponent(pulseOpacity), width: 9)
    halo.stroke()

    color.setFill()
    NSBezierPath(ovalIn: NSRect(x: 25, y: 25, width: 142, height: 142)).fill()
    let stem = NSBezierPath()
    stem.move(to: NSPoint(x: 96, y: 132))
    stem.line(to: NSPoint(x: 96, y: 82))
    roundStroke(stem, color: background, width: 18)
    stem.stroke()
    background.setFill()
    NSBezierPath(ovalIn: NSRect(x: 87, y: 52, width: 18, height: 18)).fill()
}

func drawApprove() {
    let check = NSBezierPath()
    check.move(to: NSPoint(x: 47, y: 96))
    check.line(to: NSPoint(x: 81, y: 61))
    check.line(to: NSPoint(x: 147, y: 137))
    roundStroke(check, color: green, width: 21)
    check.stroke()
}

func drawDeny() {
    let cross = NSBezierPath()
    cross.move(to: NSPoint(x: 57, y: 57))
    cross.line(to: NSPoint(x: 135, y: 135))
    cross.move(to: NSPoint(x: 135, y: 57))
    cross.line(to: NSPoint(x: 57, y: 135))
    roundStroke(cross, color: red, width: 21)
    cross.stroke()
}

func drawInterrupt() {
    red.setFill()
    NSBezierPath(roundedRect: NSRect(x: 52, y: 52, width: 88, height: 88), xRadius: 17, yRadius: 17).fill()
}

func drawCompact() {
    let arrows = NSBezierPath()
    arrows.move(to: NSPoint(x: 43, y: 137))
    arrows.line(to: NSPoint(x: 79, y: 96))
    arrows.line(to: NSPoint(x: 43, y: 55))
    arrows.move(to: NSPoint(x: 149, y: 137))
    arrows.line(to: NSPoint(x: 113, y: 96))
    arrows.line(to: NSPoint(x: 149, y: 55))
    roundStroke(arrows, color: purple, width: 18)
    arrows.stroke()
}

func drawNewSession() {
    let frame = NSBezierPath(roundedRect: NSRect(x: 39, y: 39, width: 114, height: 114), xRadius: 20, yRadius: 20)
    roundStroke(frame, color: blue, width: 16)
    frame.stroke()
    let plus = NSBezierPath()
    plus.move(to: NSPoint(x: 96, y: 65))
    plus.line(to: NSPoint(x: 96, y: 127))
    plus.move(to: NSPoint(x: 65, y: 96))
    plus.line(to: NSPoint(x: 127, y: 96))
    roundStroke(plus, color: blue, width: 16)
    plus.stroke()
}

func drawTerminalTab() {
    let window = NSBezierPath(roundedRect: NSRect(x: 32, y: 43, width: 128, height: 108), xRadius: 18, yRadius: 18)
    roundStroke(window, color: blue, width: 14)
    window.stroke()
    let header = NSBezierPath()
    header.move(to: NSPoint(x: 45, y: 123))
    header.line(to: NSPoint(x: 147, y: 123))
    roundStroke(header, color: blue, width: 12)
    header.stroke()
    let tab = NSBezierPath(roundedRect: NSRect(x: 53, y: 130, width: 42, height: 17), xRadius: 8, yRadius: 8)
    roundStroke(tab, color: teal, width: 10)
    tab.stroke()
    let prompt = NSBezierPath()
    prompt.move(to: NSPoint(x: 62, y: 91))
    prompt.line(to: NSPoint(x: 79, y: 76))
    prompt.line(to: NSPoint(x: 62, y: 61))
    prompt.move(to: NSPoint(x: 92, y: 61))
    prompt.line(to: NSPoint(x: 119, y: 61))
    roundStroke(prompt, color: teal, width: 12)
    prompt.stroke()
    let plus = NSBezierPath()
    plus.move(to: NSPoint(x: 129, y: 137))
    plus.line(to: NSPoint(x: 145, y: 137))
    plus.move(to: NSPoint(x: 137, y: 129))
    plus.line(to: NSPoint(x: 137, y: 145))
    roundStroke(plus, color: blue, width: 9)
    plus.stroke()
}

func drawTerminalWindow() {
    let backWindow = NSBezierPath(roundedRect: NSRect(x: 28, y: 50, width: 106, height: 97), xRadius: 17, yRadius: 17)
    roundStroke(backWindow, color: blue.withAlphaComponent(0.60), width: 13)
    backWindow.stroke()
    let frontWindow = NSBezierPath(roundedRect: NSRect(x: 54, y: 39, width: 110, height: 101), xRadius: 17, yRadius: 17)
    roundStroke(frontWindow, color: teal, width: 14)
    frontWindow.stroke()
    let header = NSBezierPath()
    header.move(to: NSPoint(x: 67, y: 113))
    header.line(to: NSPoint(x: 151, y: 113))
    roundStroke(header, color: teal, width: 11)
    header.stroke()
    let prompt = NSBezierPath()
    prompt.move(to: NSPoint(x: 76, y: 83))
    prompt.line(to: NSPoint(x: 91, y: 69))
    prompt.line(to: NSPoint(x: 76, y: 55))
    prompt.move(to: NSPoint(x: 103, y: 55))
    prompt.line(to: NSPoint(x: 130, y: 55))
    roundStroke(prompt, color: teal, width: 11)
    prompt.stroke()
}

func drawExit() {
    let door = NSBezierPath(roundedRect: NSRect(x: 66, y: 42, width: 58, height: 108), xRadius: 12, yRadius: 12)
    roundStroke(door, color: red, width: 14)
    door.stroke()
    red.setFill()
    NSBezierPath(ovalIn: NSRect(x: 107, y: 90, width: 11, height: 11)).fill()
    let arrow = NSBezierPath()
    arrow.move(to: NSPoint(x: 40, y: 96))
    arrow.line(to: NSPoint(x: 147, y: 96))
    arrow.move(to: NSPoint(x: 119, y: 124))
    arrow.line(to: NSPoint(x: 149, y: 96))
    arrow.line(to: NSPoint(x: 119, y: 68))
    roundStroke(arrow, color: red, width: 16)
    arrow.stroke()
}

func drawModel() {
    let sliders = NSBezierPath()
    sliders.move(to: NSPoint(x: 47, y: 58))
    sliders.line(to: NSPoint(x: 145, y: 58))
    sliders.move(to: NSPoint(x: 47, y: 96))
    sliders.line(to: NSPoint(x: 145, y: 96))
    sliders.move(to: NSPoint(x: 47, y: 134))
    sliders.line(to: NSPoint(x: 145, y: 134))
    roundStroke(sliders, color: purple, width: 12)
    sliders.stroke()
    for point in [NSPoint(x: 82, y: 58), NSPoint(x: 124, y: 96), NSPoint(x: 67, y: 134)] {
        purple.setFill()
        NSBezierPath(ovalIn: NSRect(x: point.x - 16, y: point.y - 16, width: 32, height: 32)).fill()
        background.setFill()
        NSBezierPath(ovalIn: NSRect(x: point.x - 7, y: point.y - 7, width: 14, height: 14)).fill()
    }
}

func drawReview() {
    let document = NSBezierPath(roundedRect: NSRect(x: 38, y: 43, width: 83, height: 109), xRadius: 16, yRadius: 16)
    roundStroke(document, color: teal, width: 14)
    document.stroke()
    let lines = NSBezierPath()
    lines.move(to: NSPoint(x: 61, y: 123))
    lines.line(to: NSPoint(x: 100, y: 123))
    lines.move(to: NSPoint(x: 61, y: 96))
    lines.line(to: NSPoint(x: 94, y: 96))
    lines.move(to: NSPoint(x: 61, y: 69))
    lines.line(to: NSPoint(x: 86, y: 69))
    roundStroke(lines, color: teal, width: 10)
    lines.stroke()
    let lens = NSBezierPath(ovalIn: NSRect(x: 102, y: 55, width: 43, height: 43))
    roundStroke(lens, color: blue, width: 13)
    lens.stroke()
    let handle = NSBezierPath()
    handle.move(to: NSPoint(x: 133, y: 65))
    handle.line(to: NSPoint(x: 151, y: 46))
    roundStroke(handle, color: blue, width: 13)
    handle.stroke()
}

func drawFixBug() {
    let body = NSBezierPath(roundedRect: NSRect(x: 58, y: 62, width: 76, height: 68), xRadius: 30, yRadius: 30)
    roundStroke(body, color: red, width: 15)
    body.stroke()
    let antennae = NSBezierPath()
    antennae.move(to: NSPoint(x: 75, y: 132))
    antennae.line(to: NSPoint(x: 62, y: 151))
    antennae.move(to: NSPoint(x: 117, y: 132))
    antennae.line(to: NSPoint(x: 130, y: 151))
    antennae.move(to: NSPoint(x: 48, y: 84))
    antennae.line(to: NSPoint(x: 61, y: 88))
    antennae.move(to: NSPoint(x: 48, y: 108))
    antennae.line(to: NSPoint(x: 61, y: 104))
    antennae.move(to: NSPoint(x: 144, y: 84))
    antennae.line(to: NSPoint(x: 131, y: 88))
    antennae.move(to: NSPoint(x: 144, y: 108))
    antennae.line(to: NSPoint(x: 131, y: 104))
    roundStroke(antennae, color: red, width: 12)
    antennae.stroke()
    background.setFill()
    NSBezierPath(ovalIn: NSRect(x: 78, y: 98, width: 11, height: 11)).fill()
    NSBezierPath(ovalIn: NSRect(x: 103, y: 98, width: 11, height: 11)).fill()
}

func drawTests() {
    let flask = NSBezierPath()
    flask.move(to: NSPoint(x: 75, y: 148))
    flask.line(to: NSPoint(x: 117, y: 148))
    flask.move(to: NSPoint(x: 86, y: 148))
    flask.line(to: NSPoint(x: 86, y: 109))
    flask.line(to: NSPoint(x: 54, y: 58))
    flask.curve(to: NSPoint(x: 138, y: 58), controlPoint1: NSPoint(x: 47, y: 46), controlPoint2: NSPoint(x: 145, y: 46))
    flask.line(to: NSPoint(x: 106, y: 109))
    flask.line(to: NSPoint(x: 106, y: 148))
    roundStroke(flask, color: teal, width: 14)
    flask.stroke()
    let liquid = NSBezierPath()
    liquid.move(to: NSPoint(x: 67, y: 78))
    liquid.line(to: NSPoint(x: 125, y: 78))
    roundStroke(liquid, color: green, width: 13)
    liquid.stroke()
}

func drawExplain() {
    let ring = NSBezierPath(ovalIn: NSRect(x: 35, y: 35, width: 122, height: 122))
    roundStroke(ring, color: blue, width: 17)
    ring.stroke()
    blue.setFill()
    NSBezierPath(ovalIn: NSRect(x: 86, y: 122, width: 20, height: 20)).fill()
    let stem = NSBezierPath()
    stem.move(to: NSPoint(x: 96, y: 104))
    stem.line(to: NSPoint(x: 96, y: 60))
    roundStroke(stem, color: blue, width: 18)
    stem.stroke()
}

func drawRefactor() {
    let brackets = NSBezierPath()
    brackets.move(to: NSPoint(x: 72, y: 144))
    brackets.line(to: NSPoint(x: 48, y: 144))
    brackets.line(to: NSPoint(x: 48, y: 48))
    brackets.line(to: NSPoint(x: 72, y: 48))
    brackets.move(to: NSPoint(x: 120, y: 144))
    brackets.line(to: NSPoint(x: 144, y: 144))
    brackets.line(to: NSPoint(x: 144, y: 48))
    brackets.line(to: NSPoint(x: 120, y: 48))
    roundStroke(brackets, color: purple, width: 14)
    brackets.stroke()
    let transform = NSBezierPath()
    transform.move(to: NSPoint(x: 75, y: 113))
    transform.line(to: NSPoint(x: 112, y: 113))
    transform.move(to: NSPoint(x: 98, y: 128))
    transform.line(to: NSPoint(x: 113, y: 113))
    transform.line(to: NSPoint(x: 98, y: 98))
    transform.move(to: NSPoint(x: 117, y: 79))
    transform.line(to: NSPoint(x: 80, y: 79))
    transform.move(to: NSPoint(x: 94, y: 94))
    transform.line(to: NSPoint(x: 79, y: 79))
    transform.line(to: NSPoint(x: 94, y: 64))
    roundStroke(transform, color: teal, width: 12)
    transform.stroke()
}

func drawSecurity() {
    let shield = NSBezierPath()
    shield.move(to: NSPoint(x: 96, y: 153))
    shield.line(to: NSPoint(x: 144, y: 134))
    shield.line(to: NSPoint(x: 137, y: 72))
    shield.curve(to: NSPoint(x: 96, y: 36), controlPoint1: NSPoint(x: 129, y: 55), controlPoint2: NSPoint(x: 111, y: 40))
    shield.curve(to: NSPoint(x: 55, y: 72), controlPoint1: NSPoint(x: 81, y: 40), controlPoint2: NSPoint(x: 63, y: 55))
    shield.line(to: NSPoint(x: 48, y: 134))
    shield.close()
    roundStroke(shield, color: amber, width: 16)
    shield.stroke()
    let check = NSBezierPath()
    check.move(to: NSPoint(x: 69, y: 94))
    check.line(to: NSPoint(x: 87, y: 76))
    check.line(to: NSPoint(x: 121, y: 112))
    roundStroke(check, color: amber, width: 15)
    check.stroke()
}

func drawCommit() {
    let branch = NSBezierPath()
    branch.move(to: NSPoint(x: 61, y: 48))
    branch.line(to: NSPoint(x: 61, y: 143))
    branch.move(to: NSPoint(x: 61, y: 97))
    branch.curve(to: NSPoint(x: 127, y: 124), controlPoint1: NSPoint(x: 61, y: 97), controlPoint2: NSPoint(x: 83, y: 124))
    branch.line(to: NSPoint(x: 137, y: 124))
    roundStroke(branch, color: green, width: 16)
    branch.stroke()
    for point in [NSPoint(x: 61, y: 48), NSPoint(x: 61, y: 143), NSPoint(x: 137, y: 124)] {
        green.setFill()
        NSBezierPath(ovalIn: NSRect(x: point.x - 13, y: point.y - 13, width: 26, height: 26)).fill()
    }
}

func drawDiff() {
    let divider = NSBezierPath()
    divider.move(to: NSPoint(x: 96, y: 43))
    divider.line(to: NSPoint(x: 96, y: 149))
    roundStroke(divider, color: purple, width: 12)
    divider.stroke()
    let arrows = NSBezierPath()
    arrows.move(to: NSPoint(x: 43, y: 96))
    arrows.line(to: NSPoint(x: 79, y: 96))
    arrows.move(to: NSPoint(x: 64, y: 77))
    arrows.line(to: NSPoint(x: 83, y: 96))
    arrows.line(to: NSPoint(x: 64, y: 115))
    arrows.move(to: NSPoint(x: 149, y: 96))
    arrows.line(to: NSPoint(x: 113, y: 96))
    arrows.move(to: NSPoint(x: 128, y: 77))
    arrows.line(to: NSPoint(x: 109, y: 96))
    arrows.line(to: NSPoint(x: 128, y: 115))
    roundStroke(arrows, color: purple, width: 14)
    arrows.stroke()
}

func drawPush() {
    let arrow = NSBezierPath()
    arrow.move(to: NSPoint(x: 96, y: 42))
    arrow.line(to: NSPoint(x: 96, y: 143))
    arrow.move(to: NSPoint(x: 58, y: 104))
    arrow.line(to: NSPoint(x: 96, y: 144))
    arrow.line(to: NSPoint(x: 134, y: 104))
    roundStroke(arrow, color: blue, width: 20)
    arrow.stroke()
}

func drawCreatePr() {
    let source = NSBezierPath()
    source.move(to: NSPoint(x: 53, y: 55))
    source.line(to: NSPoint(x: 53, y: 137))
    roundStroke(source, color: blue, width: 13)
    source.stroke()
    for y in [55, 137] {
        blue.setFill()
        NSBezierPath(ovalIn: NSRect(x: 40, y: y - 13, width: 26, height: 26)).fill()
    }

    let target = NSBezierPath()
    target.move(to: NSPoint(x: 139, y: 55))
    target.line(to: NSPoint(x: 139, y: 137))
    roundStroke(target, color: purple, width: 13)
    target.stroke()
    for y in [55, 137] {
        purple.setFill()
        NSBezierPath(ovalIn: NSRect(x: 126, y: y - 13, width: 26, height: 26)).fill()
    }

    let merge = NSBezierPath()
    merge.move(to: NSPoint(x: 68, y: 96))
    merge.line(to: NSPoint(x: 119, y: 96))
    merge.move(to: NSPoint(x: 99, y: 116))
    merge.line(to: NSPoint(x: 119, y: 96))
    merge.line(to: NSPoint(x: 99, y: 76))
    roundStroke(merge, color: teal, width: 14)
    merge.stroke()
}

func drawStatus() {
    let list = NSBezierPath()
    list.move(to: NSPoint(x: 74, y: 132))
    list.line(to: NSPoint(x: 143, y: 132))
    list.move(to: NSPoint(x: 74, y: 96))
    list.line(to: NSPoint(x: 143, y: 96))
    list.move(to: NSPoint(x: 74, y: 60))
    list.line(to: NSPoint(x: 143, y: 60))
    roundStroke(list, color: teal, width: 13)
    list.stroke()
    for point in [NSPoint(x: 49, y: 132), NSPoint(x: 49, y: 96), NSPoint(x: 49, y: 60)] {
        teal.setFill()
        NSBezierPath(ovalIn: NSRect(x: point.x - 8, y: point.y - 8, width: 16, height: 16)).fill()
    }
}

func drawGitLog() {
    let history = NSBezierPath()
    history.appendArc(withCenter: NSPoint(x: 96, y: 96), radius: 53, startAngle: 38, endAngle: 326, clockwise: false)
    roundStroke(history, color: purple, width: 15)
    history.stroke()
    let arrow = NSBezierPath()
    arrow.move(to: NSPoint(x: 128, y: 139))
    arrow.line(to: NSPoint(x: 151, y: 143))
    arrow.line(to: NSPoint(x: 145, y: 120))
    roundStroke(arrow, color: purple, width: 13)
    arrow.stroke()
    let hands = NSBezierPath()
    hands.move(to: NSPoint(x: 96, y: 96))
    hands.line(to: NSPoint(x: 96, y: 126))
    hands.move(to: NSPoint(x: 96, y: 96))
    hands.line(to: NSPoint(x: 119, y: 96))
    roundStroke(hands, color: blue, width: 13)
    hands.stroke()
    blue.setFill()
    NSBezierPath(ovalIn: NSRect(x: 87, y: 87, width: 18, height: 18)).fill()
}

func drawTabKey() {
    let key = NSBezierPath(roundedRect: NSRect(x: 30, y: 54, width: 132, height: 85), xRadius: 19, yRadius: 19)
    roundStroke(key, color: blue, width: 14)
    key.stroke()
    let divider = NSBezierPath()
    divider.move(to: NSPoint(x: 121, y: 73))
    divider.line(to: NSPoint(x: 121, y: 120))
    roundStroke(divider, color: teal, width: 11)
    divider.stroke()
    let arrow = NSBezierPath()
    arrow.move(to: NSPoint(x: 52, y: 96))
    arrow.line(to: NSPoint(x: 112, y: 96))
    arrow.move(to: NSPoint(x: 90, y: 116))
    arrow.line(to: NSPoint(x: 112, y: 96))
    arrow.line(to: NSPoint(x: 90, y: 76))
    roundStroke(arrow, color: teal, width: 13)
    arrow.stroke()
}

func drawUp() {
    let chevron = NSBezierPath()
    chevron.move(to: NSPoint(x: 50, y: 70))
    chevron.line(to: NSPoint(x: 96, y: 119))
    chevron.line(to: NSPoint(x: 142, y: 70))
    roundStroke(chevron, color: blue, width: 20)
    chevron.stroke()
}

func drawDown() {
    let chevron = NSBezierPath()
    chevron.move(to: NSPoint(x: 50, y: 122))
    chevron.line(to: NSPoint(x: 96, y: 73))
    chevron.line(to: NSPoint(x: 142, y: 122))
    roundStroke(chevron, color: blue, width: 20)
    chevron.stroke()
}

func drawEnter() {
    let arrow = NSBezierPath()
    arrow.move(to: NSPoint(x: 145, y: 132))
    arrow.line(to: NSPoint(x: 145, y: 83))
    arrow.line(to: NSPoint(x: 61, y: 83))
    arrow.move(to: NSPoint(x: 87, y: 112))
    arrow.line(to: NSPoint(x: 58, y: 83))
    arrow.line(to: NSPoint(x: 87, y: 54))
    roundStroke(arrow, color: blue, width: 18)
    arrow.stroke()
}

func drawPage(_ direction: Int) {
    let page = NSBezierPath(roundedRect: NSRect(x: 48, y: 43, width: 100, height: 106), xRadius: 17, yRadius: 17)
    roundStroke(page, color: purple, width: 14)
    page.stroke()
    let arrow = NSBezierPath()
    arrow.move(to: NSPoint(x: 96, y: 66))
    arrow.line(to: NSPoint(x: 96, y: 126))
    if direction > 0 {
        arrow.move(to: NSPoint(x: 69, y: 98))
        arrow.line(to: NSPoint(x: 96, y: 126))
        arrow.line(to: NSPoint(x: 123, y: 98))
    } else {
        arrow.move(to: NSPoint(x: 69, y: 94))
        arrow.line(to: NSPoint(x: 96, y: 66))
        arrow.line(to: NSPoint(x: 123, y: 94))
    }
    roundStroke(arrow, color: purple, width: 15)
    arrow.stroke()
}

func drawMode() {
    let sliders = NSBezierPath()
    sliders.move(to: NSPoint(x: 48, y: 62))
    sliders.line(to: NSPoint(x: 144, y: 62))
    sliders.move(to: NSPoint(x: 48, y: 99))
    sliders.line(to: NSPoint(x: 144, y: 99))
    sliders.move(to: NSPoint(x: 48, y: 136))
    sliders.line(to: NSPoint(x: 144, y: 136))
    roundStroke(sliders, color: amber, width: 12)
    sliders.stroke()
    for point in [NSPoint(x: 116, y: 62), NSPoint(x: 76, y: 99), NSPoint(x: 125, y: 136)] {
        amber.setFill()
        NSBezierPath(ovalIn: NSRect(x: point.x - 15, y: point.y - 15, width: 30, height: 30)).fill()
    }
}

func drawUsage() {
    let gauge = NSBezierPath()
    gauge.appendArc(withCenter: NSPoint(x: 96, y: 85), radius: 54, startAngle: 200, endAngle: 340, clockwise: false)
    roundStroke(gauge, color: teal, width: 17)
    gauge.stroke()
    let needle = NSBezierPath()
    needle.move(to: NSPoint(x: 96, y: 85))
    needle.line(to: NSPoint(x: 126, y: 112))
    roundStroke(needle, color: teal, width: 15)
    needle.stroke()
    teal.setFill()
    NSBezierPath(ovalIn: NSRect(x: 85, y: 74, width: 22, height: 22)).fill()
}

func drawAgent() {
    let connections = NSBezierPath()
    connections.move(to: NSPoint(x: 96, y: 134))
    connections.line(to: NSPoint(x: 96, y: 104))
    connections.line(to: NSPoint(x: 57, y: 64))
    connections.move(to: NSPoint(x: 96, y: 104))
    connections.line(to: NSPoint(x: 135, y: 64))
    roundStroke(connections, color: blue, width: 14)
    connections.stroke()
    purple.setFill()
    NSBezierPath(ovalIn: NSRect(x: 76, y: 114, width: 40, height: 40)).fill()
    for point in [NSPoint(x: 57, y: 64), NSPoint(x: 135, y: 64)] {
        blue.setFill()
        NSBezierPath(ovalIn: NSRect(x: point.x - 20, y: point.y - 20, width: 40, height: 40)).fill()
        background.setFill()
        NSBezierPath(ovalIn: NSRect(x: point.x - 7, y: point.y - 7, width: 14, height: 14)).fill()
    }
}

func drawFork() {
    let paths = NSBezierPath()
    paths.move(to: NSPoint(x: 59, y: 47))
    paths.line(to: NSPoint(x: 59, y: 145))
    paths.move(to: NSPoint(x: 59, y: 98))
    paths.curve(to: NSPoint(x: 127, y: 126), controlPoint1: NSPoint(x: 59, y: 98), controlPoint2: NSPoint(x: 83, y: 126))
    paths.line(to: NSPoint(x: 141, y: 126))
    paths.move(to: NSPoint(x: 59, y: 98))
    paths.curve(to: NSPoint(x: 124, y: 68), controlPoint1: NSPoint(x: 59, y: 98), controlPoint2: NSPoint(x: 82, y: 68))
    paths.line(to: NSPoint(x: 141, y: 68))
    roundStroke(paths, color: purple, width: 16)
    paths.stroke()
    for point in [NSPoint(x: 59, y: 47), NSPoint(x: 59, y: 145), NSPoint(x: 141, y: 126), NSPoint(x: 141, y: 68)] {
        purple.setFill()
        NSBezierPath(ovalIn: NSRect(x: point.x - 12, y: point.y - 12, width: 24, height: 24)).fill()
    }
}

func drawFavorite() {
    let star = NSBezierPath()
    let center = NSPoint(x: 96, y: 96)
    for index in 0..<10 {
        let angle = CGFloat(-90 + index * 36) * .pi / 180
        let radius: CGFloat = index % 2 == 0 ? 62 : 27
        let point = NSPoint(x: center.x + cos(angle) * radius, y: center.y + sin(angle) * radius)
        if index == 0 { star.move(to: point) } else { star.line(to: point) }
    }
    star.close()
    roundStroke(star, color: amber, width: 14)
    star.stroke()
}

func drawClipboard() {
    let board = NSBezierPath(roundedRect: NSRect(x: 48, y: 38, width: 100, height: 115), xRadius: 18, yRadius: 18)
    roundStroke(board, color: teal, width: 15)
    board.stroke()
    let clip = NSBezierPath(roundedRect: NSRect(x: 76, y: 132, width: 40, height: 25), xRadius: 10, yRadius: 10)
    roundStroke(clip, color: teal, width: 13)
    clip.stroke()
    let lines = NSBezierPath()
    lines.move(to: NSPoint(x: 74, y: 108))
    lines.line(to: NSPoint(x: 122, y: 108))
    lines.move(to: NSPoint(x: 74, y: 78))
    lines.line(to: NSPoint(x: 111, y: 78))
    roundStroke(lines, color: teal, width: 12)
    lines.stroke()
}

func drawCapture() {
    let corners = NSBezierPath()
    corners.move(to: NSPoint(x: 77, y: 149))
    corners.line(to: NSPoint(x: 48, y: 149))
    corners.line(to: NSPoint(x: 48, y: 120))
    corners.move(to: NSPoint(x: 115, y: 149))
    corners.line(to: NSPoint(x: 144, y: 149))
    corners.line(to: NSPoint(x: 144, y: 120))
    corners.move(to: NSPoint(x: 48, y: 72))
    corners.line(to: NSPoint(x: 48, y: 43))
    corners.line(to: NSPoint(x: 77, y: 43))
    corners.move(to: NSPoint(x: 144, y: 72))
    corners.line(to: NSPoint(x: 144, y: 43))
    corners.line(to: NSPoint(x: 115, y: 43))
    roundStroke(corners, color: blue, width: 16)
    corners.stroke()
    let lens = NSBezierPath(ovalIn: NSRect(x: 76, y: 76, width: 40, height: 40))
    roundStroke(lens, color: purple, width: 14)
    lens.stroke()
}

func drawPlan() {
    let page = NSBezierPath(roundedRect: NSRect(x: 48, y: 38, width: 100, height: 115), xRadius: 17, yRadius: 17)
    roundStroke(page, color: blue, width: 15)
    page.stroke()
    let checks = NSBezierPath()
    for y in [122, 96, 70] {
        checks.move(to: NSPoint(x: 66, y: y))
        checks.line(to: NSPoint(x: 74, y: y - 8))
        checks.line(to: NSPoint(x: 84, y: y + 7))
        checks.move(to: NSPoint(x: 98, y: y))
        checks.line(to: NSPoint(x: 128, y: y))
    }
    roundStroke(checks, color: blue, width: 11)
    checks.stroke()
}

func drawHandoff() {
    let path = NSBezierPath()
    path.move(to: NSPoint(x: 48, y: 96))
    path.line(to: NSPoint(x: 133, y: 96))
    path.move(to: NSPoint(x: 105, y: 126))
    path.line(to: NSPoint(x: 136, y: 96))
    path.line(to: NSPoint(x: 105, y: 66))
    roundStroke(path, color: teal, width: 18)
    path.stroke()
    purple.setFill()
    NSBezierPath(ovalIn: NSRect(x: 36, y: 84, width: 24, height: 24)).fill()
}

func drawVoiceMic(_ color: NSColor) {
    color.setFill()
    NSBezierPath(roundedRect: NSRect(x: 74, y: 94, width: 44, height: 72), xRadius: 22, yRadius: 22).fill()
    let holder = NSBezierPath()
    holder.appendArc(withCenter: NSPoint(x: 96, y: 100), radius: 42, startAngle: 180, endAngle: 360, clockwise: false)
    roundStroke(holder, color: color, width: 14)
    holder.stroke()
    let stand = NSBezierPath()
    stand.move(to: NSPoint(x: 96, y: 58))
    stand.line(to: NSPoint(x: 96, y: 38))
    stand.move(to: NSPoint(x: 72, y: 32))
    stand.line(to: NSPoint(x: 120, y: 32))
    roundStroke(stand, color: color, width: 14)
    stand.stroke()
}

func drawMute() {
    drawVoiceMic(purple)
    let slash = NSBezierPath()
    slash.move(to: NSPoint(x: 42, y: 38))
    slash.line(to: NSPoint(x: 150, y: 154))
    roundStroke(slash, color: red, width: 16)
    slash.stroke()
}

func drawConverse() {
    let bubble = NSBezierPath(roundedRect: NSRect(x: 30, y: 64, width: 132, height: 94), xRadius: 26, yRadius: 26)
    roundStroke(bubble, color: teal, width: 13)
    bubble.stroke()
    let tail = NSBezierPath()
    tail.move(to: NSPoint(x: 64, y: 66))
    tail.line(to: NSPoint(x: 54, y: 34))
    tail.line(to: NSPoint(x: 94, y: 62))
    roundStroke(tail, color: teal, width: 13)
    tail.stroke()
    let bars = NSBezierPath()
    bars.move(to: NSPoint(x: 72, y: 98))
    bars.line(to: NSPoint(x: 72, y: 124))
    bars.move(to: NSPoint(x: 96, y: 86))
    bars.line(to: NSPoint(x: 96, y: 136))
    bars.move(to: NSPoint(x: 120, y: 98))
    bars.line(to: NSPoint(x: 120, y: 124))
    roundStroke(bars, color: green, width: 13)
    bars.stroke()
}

func drawSpeak(frame: Int) {
    green.setFill()
    NSBezierPath(roundedRect: NSRect(x: 30, y: 74, width: 24, height: 44), xRadius: 6, yRadius: 6).fill()
    let wedge = NSBezierPath()
    wedge.move(to: NSPoint(x: 52, y: 76))
    wedge.line(to: NSPoint(x: 86, y: 46))
    wedge.line(to: NSPoint(x: 86, y: 146))
    wedge.line(to: NSPoint(x: 52, y: 116))
    wedge.close()
    wedge.fill()
    let arcCount = [1, 2, 3, 2][frame]
    for index in 0..<arcCount {
        let arc = NSBezierPath()
        arc.appendArc(withCenter: NSPoint(x: 90, y: 96), radius: CGFloat(28 + (index * 22)), startAngle: -42, endAngle: 42, clockwise: false)
        roundStroke(arc, color: green, width: 13)
        arc.stroke()
    }
}

func drawRevert() {
    let arrow = NSBezierPath()
    arrow.appendArc(withCenter: NSPoint(x: 100, y: 94), radius: 49, startAngle: 35, endAngle: 285, clockwise: true)
    arrow.move(to: NSPoint(x: 43, y: 105))
    arrow.line(to: NSPoint(x: 60, y: 131))
    arrow.line(to: NSPoint(x: 79, y: 103))
    roundStroke(arrow, color: amber, width: 17)
    arrow.stroke()
}

try writeIcon(named: "ready", draw: drawReady)
for frame in 0..<4 {
    try writeIcon(named: "busy\(frame)") { drawBusy(frame: frame) }
}
let attentionPulse: [CGFloat] = [0.26, 0.44, 0.70, 0.44]
for frame in 0..<4 {
    try writeIcon(named: "waiting\(frame)") { drawAlert(amber, pulseOpacity: attentionPulse[frame]) }
    try writeIcon(named: "risk\(frame)") { drawAlert(red, pulseOpacity: attentionPulse[frame]) }
}
try writeIcon(named: "approve", draw: drawApprove)
try writeIcon(named: "deny", draw: drawDeny)
try writeIcon(named: "interrupt", draw: drawInterrupt)
try writeIcon(named: "compact", draw: drawCompact)
try writeIcon(named: "newsession", draw: drawNewSession)
try writeIcon(named: "terminaltab", draw: drawTerminalTab)
try writeIcon(named: "terminalwindow", draw: drawTerminalWindow)
try writeIcon(named: "exit", draw: drawExit)
try writeIcon(named: "model", draw: drawModel)
try writeIcon(named: "review", draw: drawReview)
try writeIcon(named: "fixbug", draw: drawFixBug)
try writeIcon(named: "tests", draw: drawTests)
try writeIcon(named: "explain", draw: drawExplain)
try writeIcon(named: "refactor", draw: drawRefactor)
try writeIcon(named: "security", draw: drawSecurity)
try writeIcon(named: "commit", draw: drawCommit)
try writeIcon(named: "diff", draw: drawDiff)
try writeIcon(named: "push", draw: drawPush)
try writeIcon(named: "createpr", draw: drawCreatePr)
try writeIcon(named: "status", draw: drawStatus)
try writeIcon(named: "gitlog", draw: drawGitLog)
try writeIcon(named: "tabkey", draw: drawTabKey)
try writeIcon(named: "up", draw: drawUp)
try writeIcon(named: "down", draw: drawDown)
try writeIcon(named: "enter", draw: drawEnter)
try writeIcon(named: "pageup") { drawPage(-1) }
try writeIcon(named: "pagedown") { drawPage(1) }
try writeIcon(named: "mode", draw: drawMode)
try writeIcon(named: "usage", draw: drawUsage)
try writeIcon(named: "agent", draw: drawAgent)
try writeIcon(named: "fork", draw: drawFork)
try writeIcon(named: "favorite", draw: drawFavorite)
try writeIcon(named: "clipboard", draw: drawClipboard)
try writeIcon(named: "capture", draw: drawCapture)
try writeIcon(named: "plan", draw: drawPlan)
try writeIcon(named: "handoff", draw: drawHandoff)
try writeIcon(named: "revert", draw: drawRevert)
try writeIcon(named: "converse", draw: drawConverse)
try writeIcon(named: "mute", draw: drawMute)
for frame in 0..<4 {
    try writeIcon(named: "speak\(frame)") { drawSpeak(frame: frame) }
}

for legacyName in ["idle", "risk", "waiting", "prompt", "writetests", "tab", "log"] {
    try? FileManager.default.removeItem(at: outputDirectory.appendingPathComponent("\(legacyName).png"))
}
