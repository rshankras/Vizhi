import AVFoundation
import AppKit
import Foundation

func argument(_ name: String) -> String? {
    let values = CommandLine.arguments
    guard let index = values.firstIndex(of: name), index + 1 < values.count else { return nil }
    return values[index + 1]
}

func log(_ message: String) {
    FileHandle.standardError.write(Data(("[vizhi-voice] \(message)\n").utf8))
}

let home = NSHomeDirectory()
let temporaryPath = "\(home)/.vizhi/voice/tmp"
let recordingPath = argument("--out") ?? "\(temporaryPath)/recording.wav"
let modelPath = argument("--model") ?? "\(home)/.vizhi/voice/models/ggml-base.en.bin"
let transcriptPath = argument("--transcript") ?? "\(temporaryPath)/transcript.txt"
let stopPath = argument("--stopflag") ?? "\(temporaryPath)/recording.stop"
let maximumSeconds = Double(argument("--maxsec") ?? "60") ?? 60
let requestMicrophonePermissionOnly = CommandLine.arguments.contains("--request-microphone-permission")
let fileManager = FileManager.default

func whisperBinary() -> String? {
    if let supplied = argument("--whisper"), fileManager.isExecutableFile(atPath: supplied) { return supplied }
    for candidate in ["/opt/homebrew/bin/whisper-cli", "/usr/local/bin/whisper-cli"] {
        if fileManager.isExecutableFile(atPath: candidate) { return candidate }
    }
    return nil
}

let permission = DispatchSemaphore(value: 0)
var microphoneGranted = false
AVCaptureDevice.requestAccess(for: .audio) { granted in
    microphoneGranted = granted
    permission.signal()
}
permission.wait()
guard microphoneGranted else {
    log("microphone permission denied")
    exit(2)
}
if requestMicrophonePermissionOnly { exit(0) }

try? fileManager.removeItem(atPath: transcriptPath)
try? fileManager.removeItem(atPath: stopPath)

let recordingUrl = URL(fileURLWithPath: recordingPath)
let privateDirectoryAttributes: [FileAttributeKey: Any] = [.posixPermissions: NSNumber(value: 0o700)]
let privateFileAttributes: [FileAttributeKey: Any] = [.posixPermissions: NSNumber(value: 0o600)]
try? fileManager.createDirectory(at: recordingUrl.deletingLastPathComponent(), withIntermediateDirectories: true, attributes: privateDirectoryAttributes)
try? fileManager.setAttributes(privateDirectoryAttributes, ofItemAtPath: recordingUrl.deletingLastPathComponent().path)
func removeRecording() {
    try? fileManager.removeItem(at: recordingUrl)
}
defer { removeRecording() }
try? fileManager.removeItem(at: recordingUrl)
let settings: [String: Any] = [
    AVFormatIDKey: Int(kAudioFormatLinearPCM),
    AVSampleRateKey: 16000.0,
    AVNumberOfChannelsKey: 1,
    AVLinearPCMBitDepthKey: 16,
    AVLinearPCMIsFloatKey: false,
    AVLinearPCMIsBigEndianKey: false,
]
guard let recorder = try? AVAudioRecorder(url: recordingUrl, settings: settings), recorder.record() else {
    removeRecording()
    log("failed to begin recording")
    exit(3)
}
try? fileManager.setAttributes(privateFileAttributes, ofItemAtPath: recordingPath)

NSSound(named: "Tink")?.play()
let startedAt = Date()
while !fileManager.fileExists(atPath: stopPath) && Date().timeIntervalSince(startedAt) < maximumSeconds {
    RunLoop.current.run(until: Date().addingTimeInterval(0.12))
}
recorder.stop()
try? fileManager.removeItem(atPath: stopPath)

guard let whisper = whisperBinary() else {
    removeRecording()
    log("whisper-cli not found")
    exit(4)
}
guard fileManager.fileExists(atPath: modelPath) else {
    removeRecording()
    log("Whisper model not found")
    exit(5)
}

let process = Process()
process.executableURL = URL(fileURLWithPath: whisper)
process.arguments = ["-m", modelPath, "-f", recordingPath, "-nt"]
let output = Pipe()
process.standardOutput = output
process.standardError = FileHandle.nullDevice
do {
    try process.run()
} catch {
    removeRecording()
    log("whisper-cli failed to start: \(error)")
    exit(6)
}
let data = output.fileHandleForReading.readDataToEndOfFile()
process.waitUntilExit()
var transcript = String(data: data, encoding: .utf8) ?? ""
transcript = transcript.replacingOccurrences(of: "\n", with: " ").trimmingCharacters(in: .whitespacesAndNewlines)
if ["[BLANK_AUDIO]", "(silence)", "[ Silence ]"].contains(transcript) { transcript = "" }
try? transcript.write(toFile: transcriptPath, atomically: true, encoding: .utf8)
try? fileManager.setAttributes(privateFileAttributes, ofItemAtPath: transcriptPath)
