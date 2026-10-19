/**
 * Global ⌘⌥L listener. Cursor's composer is not a VS Code editor, so the
 * extension keybinding never fires there. This agent registers a Carbon
 * hotkey, and when Cursor is frontmost it copies the selection, seals it
 * through the Keybox CLI, and pastes the handle back.
 */

import AppKit
import Carbon

private let hotKeySignature = OSType(0x4B42584B) // 'KBXK'
private var hotKeyRef: EventHotKeyRef?
private let logURL = FileManager.default.homeDirectoryForCurrentUser
  .appendingPathComponent(".keybox/hotkey.log")

@main
enum KeyboxHotkey {
  static func main() {
    FileManager.default.createFile(atPath: logURL.path, contents: nil)
    log("starting")
    promptAccessibility()
    installHotKey()
    let app = NSApplication.shared
    app.setActivationPolicy(.accessory)
    app.run()
  }
}

private func installHotKey() {
  var spec = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
  let status = InstallEventHandler(
    GetApplicationEventTarget(),
    { _, event, _ in
      var hotKeyID = EventHotKeyID()
      GetEventParameter(
        event,
        EventParamName(kEventParamDirectObject),
        EventParamType(typeEventHotKeyID),
        nil,
        MemoryLayout<EventHotKeyID>.size,
        nil,
        &hotKeyID,
      )
      if hotKeyID.signature == hotKeySignature {
        sealFrontmostSelection()
      }
      return noErr
    },
    1,
    &spec,
    nil,
    nil,
  )
  guard status == noErr else {
    log("InstallEventHandler failed: \(status)")
    return
  }

  let id = EventHotKeyID(signature: hotKeySignature, id: 1)
  let registered = RegisterEventHotKey(
    UInt32(kVK_ANSI_L),
    UInt32(cmdKey | optionKey),
    id,
    GetApplicationEventTarget(),
    0,
    &hotKeyRef,
  )
  if registered != noErr {
    log("RegisterEventHotKey failed: \(registered)")
  } else {
    log("registered ⌘⌥L")
  }
}

private func sealFrontmostSelection() {
  guard isCursorFrontmost() else {
    log("ignored — Cursor is not frontmost")
    return
  }
  if !AXIsProcessTrusted() {
    promptAccessibility()
    log("blocked — grant Accessibility to keybox-hotkey, then retry")
    return
  }

  let board = NSPasteboard.general
  let previous = board.string(forType: .string) ?? ""
  postKey(UInt16(kVK_ANSI_C), flags: .maskCommand)
  usleep(200_000)
  let selected = board.string(forType: .string) ?? ""
  if selected.isEmpty {
    log("copy produced empty clipboard")
    return
  }

  let handle: String
  do {
    handle = try runKeybox(["seal", "--stdin", "--raw"], stdin: selected).trimmingCharacters(in: .whitespacesAndNewlines)
  } catch {
    log("seal failed: \(error)")
    restoreClipboard(previous)
    return
  }
  guard !handle.isEmpty else {
    log("seal returned empty handle")
    return
  }

  board.clearContents()
  board.setString(handle, forType: .string)
  usleep(80_000)
  postKey(UInt16(kVK_ANSI_V), flags: .maskCommand)
  log("sealed → \(handle)")
}

private func isCursorFrontmost() -> Bool {
  guard let app = NSWorkspace.shared.frontmostApplication else { return false }
  let bundle = (app.bundleIdentifier ?? "").lowercased()
  let name = (app.localizedName ?? "").lowercased()
  return name.contains("cursor")
    || bundle.contains("cursor")
    || bundle.contains("anysphere")
    || bundle.contains("todesktop.230313")
}

private func promptAccessibility() {
  let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
  _ = AXIsProcessTrustedWithOptions(options)
}

private func postKey(_ key: UInt16, flags: CGEventFlags) {
  let source = CGEventSource(stateID: .hidSystemState)
  let down = CGEvent(keyboardEventSource: source, virtualKey: key, keyDown: true)
  let up = CGEvent(keyboardEventSource: source, virtualKey: key, keyDown: false)
  down?.flags = flags
  up?.flags = flags
  down?.post(tap: .cghidEventTap)
  up?.post(tap: .cghidEventTap)
}

private func runKeybox(_ args: [String], stdin: String) throws -> String {
  let shim = FileManager.default.homeDirectoryForCurrentUser
    .appendingPathComponent(".keybox/bin/keybox").path
  let process = Process()
  process.executableURL = URL(fileURLWithPath: shim)
  process.arguments = args
  let input = Pipe()
  let output = Pipe()
  let err = Pipe()
  process.standardInput = input
  process.standardOutput = output
  process.standardError = err
  try process.run()
  input.fileHandleForWriting.write(Data(stdin.utf8))
  try input.fileHandleForWriting.close()
  process.waitUntilExit()
  let stdout = String(data: output.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
  if process.terminationStatus != 0 {
    let stderr = String(data: err.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
    throw NSError(domain: "keybox", code: Int(process.terminationStatus), userInfo: [
      NSLocalizedDescriptionKey: stderr.isEmpty ? stdout : stderr,
    ])
  }
  return stdout
}

private func restoreClipboard(_ value: String) {
  let board = NSPasteboard.general
  board.clearContents()
  if !value.isEmpty { board.setString(value, forType: .string) }
}

private func log(_ message: String) {
  let line = "\(ISO8601DateFormatter().string(from: Date())) \(message)\n"
  guard let data = line.data(using: .utf8), let handle = try? FileHandle(forWritingTo: logURL) else { return }
  defer { try? handle.close() }
  _ = try? handle.seekToEnd()
  _ = try? handle.write(contentsOf: data)
}
