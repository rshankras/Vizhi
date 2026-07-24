ObjC.import("Foundation");

var fileManager = $.NSFileManager.defaultManager;
var utf8 = $.NSUTF8StringEncoding;
var rootPath = environment("VIZHI_IPC_ROOT") || "/tmp/vizhi";
var sessionsPath = rootPath + "/sessions";
var draftsPath = rootPath + "/drafts";

function unwrap(value) {
    return ObjC.unwrap(value);
}

function environment(name) {
    var value = $.NSProcessInfo.processInfo.environment.objectForKey(name);
    return value ? unwrap(value) : null;
}

function ensureDirectory(path) {
    var error = $();
    var attributes = $({ NSFilePosixPermissions: 448 });
    var created = fileManager.createDirectoryAtPathWithIntermediateDirectoriesAttributesError($(path), true, attributes, error);
    if (!created) throw new Error("Vizhi could not prepare local state storage.");
    fileManager.setAttributesOfItemAtPathError(attributes, $(path), null);
}

function exists(path) {
    return fileManager.fileExistsAtPath($(path));
}

function readText(path) {
    var data = $.NSData.dataWithContentsOfFile($(path));
    if (data.isNil()) return null;
    var value = $.NSString.alloc.initWithDataEncoding(data, utf8);
    return value.isNil() ? null : unwrap(value);
}

function readJson(path) {
    try {
        var source = readText(path);
        return source ? JSON.parse(source) : null;
    } catch (error) {
        return null;
    }
}

function writeJson(path, value) {
    var source = $(JSON.stringify(value, null, 2) + "\n");
    var written = source.writeToFileAtomicallyEncodingError($(path), true, utf8, null);
    if (!written) throw new Error("Vizhi could not write local session state.");
    fileManager.setAttributesOfItemAtPathError($({ NSFilePosixPermissions: 384 }), $(path), null);
}

function taskOutput(path, arguments) {
    var task = $.NSTask.alloc.init;
    task.setLaunchPath($(path));
    task.setArguments($(arguments));
    var outputPipe = $.NSPipe.pipe;
    var errorPipe = $.NSPipe.pipe;
    task.setStandardOutput(outputPipe);
    task.setStandardError(errorPipe);
    task.launch;
    task.waitUntilExit;
    var outputData = outputPipe.fileHandleForReading.readDataToEndOfFile;
    var output = $.NSString.alloc.initWithDataEncoding(outputData, utf8);
    if (task.terminationStatus !== 0) throw new Error("Vizhi helper command failed.");
    return output.isNil() ? "" : unwrap(output);
}

function text(value) {
    return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function pick(payload, keys) {
    if (!isObject(payload)) return null;
    for (var index = 0; index < keys.length; index += 1) {
        var direct = text(payload[keys[index]]);
        if (direct) return direct;
    }
    var nestedKeys = ["session", "context", "input", "tool_input", "tool"];
    for (var nestedIndex = 0; nestedIndex < nestedKeys.length; nestedIndex += 1) {
        var nested = payload[nestedKeys[nestedIndex]];
        var found = pick(nested, keys);
        if (found) return found;
    }
    return null;
}

function parentTty() {
    try {
        var pid = unwrap($.NSProcessInfo.processInfo.processIdentifier);
        var parentPid = taskOutput("/bin/ps", ["-o", "ppid=", "-p", String(pid)]).trim();
        var tty = taskOutput("/bin/ps", ["-o", "tty=", "-p", parentPid]).trim();
        return tty && tty !== "??" ? "/dev/" + tty : null;
    } catch (error) {
        return null;
    }
}

function identity(payload) {
    var tty = pick(payload, ["tty", "terminal_tty"]) || parentTty();
    var cwd = pick(payload, ["cwd", "workspace", "working_directory"]);
    var sessionId = pick(payload, ["session_id", "sessionId", "thread_id", "threadId", "id"]);
    if (!sessionId) sessionId = (tty || "tty-unknown") + "-" + unwrap($.NSProcessInfo.processInfo.processIdentifier);
    return { sessionId: sessionId, tty: tty, cwd: cwd };
}

function baseName(path) {
    if (!path) return "Codex";
    var segments = String(path).split("/").filter(function (segment) { return Boolean(segment); });
    return segments.length ? segments[segments.length - 1] : "Codex";
}

function sessionFilename(sessionId) {
    return String(sessionId).replace(/[^a-zA-Z0-9._-]/g, "_") + ".json";
}

function base64Url(value) {
    var data = $(String(value)).dataUsingEncoding(utf8);
    return unwrap(data.base64EncodedStringWithOptions(0)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function clearScreenshotDraft(sessionId) {
    var path = draftsPath + "/" + base64Url(sessionId) + ".json";
    if (exists(path)) fileManager.removeItemAtPathError($(path), null);
}

function readTail(path, maximumBytes) {
    var attributes = fileManager.attributesOfItemAtPathError($(path), null);
    if (attributes.isNil()) return null;
    var size = unwrap(attributes.objectForKey($.NSFileSize));
    var handle = $.NSFileHandle.fileHandleForReadingAtPath($(path));
    if (handle.isNil()) return null;
    if (size > maximumBytes) handle.seekToFileOffset(size - maximumBytes);
    var data = handle.readDataToEndOfFile;
    handle.closeFile;
    var value = $.NSString.alloc.initWithDataEncoding(data, utf8);
    return value.isNil() ? null : unwrap(value);
}

function contextPercent(transcriptPath) {
    if (!transcriptPath || transcriptPath.indexOf("/") !== 0) return null;
    var home = environment("HOME") || unwrap($.NSHomeDirectory());
    var sessionsRoot = home + "/.codex/sessions/";
    if (transcriptPath.indexOf(sessionsRoot) !== 0 || transcriptPath.split("/").indexOf("..") !== -1) return null;
    try {
        var content = readTail(transcriptPath, 524288);
        if (content === null) return null;
        var lines = content.replace(/\s+$/, "").split("\n");
        for (var index = lines.length - 1; index >= 0; index -= 1) {
            try {
                var entry = JSON.parse(lines[index]);
                var info = entry && entry.payload && entry.payload.info;
                var usage = info && info.last_token_usage;
                var contextWindow = info && info.model_context_window;
                var totalTokens = usage && usage.total_tokens;
                if (typeof contextWindow !== "number" || contextWindow <= 0 || typeof totalTokens !== "number" || totalTokens < 0) continue;
                return Math.min(100, Math.max(0, Math.round(totalTokens / contextWindow * 100)));
            } catch (error) {
            }
        }
    } catch (error) {
    }
    return null;
}

function lastAgentMessage(transcriptPath) {
    if (!transcriptPath || transcriptPath.indexOf("/") !== 0) return null;
    var home = environment("HOME") || unwrap($.NSHomeDirectory());
    var sessionsRoot = home + "/.codex/sessions/";
    if (transcriptPath.indexOf(sessionsRoot) !== 0 || transcriptPath.split("/").indexOf("..") !== -1) return null;
    try {
        var content = readTail(transcriptPath, 524288);
        if (content === null) return null;
        var lines = content.replace(/\s+$/, "").split("\n");
        for (var index = lines.length - 1; index >= 0; index -= 1) {
            try {
                var entry = JSON.parse(lines[index]);
                var payload = entry && entry.payload;
                if (!payload) continue;
                if (entry.type === "event_msg" && payload.type === "agent_message" && typeof payload.message === "string" && payload.message.trim()) {
                    return payload.message.trim();
                }
                if (entry.type === "response_item" && payload.type === "message" && payload.role === "assistant" && Array.isArray(payload.content)) {
                    var parts = [];
                    for (var partIndex = 0; partIndex < payload.content.length; partIndex += 1) {
                        var part = payload.content[partIndex];
                        if (part && typeof part.text === "string") parts.push(part.text);
                    }
                    var message = parts.join(" ").trim();
                    if (message) return message;
                }
            } catch (error) {
            }
        }
    } catch (error) {
    }
    return null;
}

function hookEvent() {
    var processArguments = $.NSProcessInfo.processInfo.arguments;
    return unwrap(processArguments.objectAtIndex(processArguments.count - 1));
}

function standardInput() {
    var data = $.NSFileHandle.fileHandleWithStandardInput.readDataToEndOfFile;
    var value = $.NSString.alloc.initWithDataEncoding(data, utf8);
    return value ? unwrap(value) : "";
}

function writeHookResponse() {
    var data = $("{}\n").dataUsingEncoding(utf8);
    $.NSFileHandle.fileHandleWithStandardOutput.writeData(data);
}

function now() {
    return new Date().toISOString();
}

function handle(eventName, payload) {
    ensureDirectory(rootPath);
    ensureDirectory(sessionsPath);
    ensureDirectory(draftsPath);

    var identityValue = identity(payload);
    var sessionPath = sessionsPath + "/" + sessionFilename(identityValue.sessionId);
    var existing = readJson(sessionPath);
    var cwd = pick(payload, ["cwd", "workspace", "working_directory"]) || (existing && existing.cwd) || identityValue.cwd || null;
    var session = existing || {};
    session.schema = 1;
    session.session_id = identityValue.sessionId;
    session.agent = session.agent || "codex";
    session.cwd = cwd;
    session.tty = identityValue.tty || session.tty || null;
    session.project = pick(payload, ["project", "project_name"]) || session.project || baseName(cwd);
    session.model = pick(payload, ["model", "model_name"]) || session.model || null;
    session.reasoning = pick(payload, ["reasoning", "reasoning_effort", "effort"]) || session.reasoning || null;
    var usage = contextPercent(pick(payload, ["transcript_path"]));
    if (usage !== null) session.ctx_pct = usage;
    else if (session.ctx_pct === undefined) session.ctx_pct = null;
    if (session.cost_usd === undefined) session.cost_usd = null;
    if (!Array.isArray(session.capabilities)) session.capabilities = ["approve", "skills", "model", "mode"];
    session.updated_at = now();

    var normalized = String(eventName || "").toLowerCase();
    if (normalized === "sessionstart") {
        if (pick(payload, ["source"]) === "compact" && existing && existing.state === "busy") {
            writeJson(sessionPath, session);
            return;
        }
        session.state = "idle";
        session.waiting_kind = null;
        session.question = null;
    } else if (normalized === "userpromptsubmit") {
        clearScreenshotDraft(identityValue.sessionId);
        session.state = "busy";
        session.waiting_kind = null;
        session.question = null;
        session.last_message = null;
    } else if (normalized === "pretooluse") {
        session.state = "busy";
        session.pending_tool = pick(payload, ["tool_name", "toolName", "name"]);
        session.pending_command = pick(payload, ["command", "cmd", "input"]);
    } else if (normalized === "permissionrequest") {
        session.state = "waiting";
        session.waiting_kind = "permission";
        session.question = pick(payload, ["question", "message", "prompt", "reason"]) || "Approval requested";
    } else if (normalized === "posttooluse") {
        var completedTool = pick(payload, ["tool_name", "toolName", "name"]);
        if (completedTool && completedTool === session.pending_tool) {
            session.state = "busy";
            session.waiting_kind = null;
            session.question = null;
            session.pending_tool = null;
            session.pending_command = null;
        }
    } else if (normalized === "stop" || normalized === "agent-turn-complete") {
        session.state = "idle";
        session.waiting_kind = null;
        session.question = null;
        session.pending_tool = null;
        session.pending_command = null;
        var lastMessage = pick(payload, ["last_assistant_message", "last-assistant-message", "lastAssistantMessage", "assistant_message"])
            || lastAgentMessage(pick(payload, ["transcript_path"]));
        if (lastMessage) session.last_message = String(lastMessage).slice(0, 2000);
        else if (session.last_message === undefined) session.last_message = null;
    } else if (normalized === "sessionend") {
        clearScreenshotDraft(identityValue.sessionId);
        session.state = "dead";
    }
    writeJson(sessionPath, session);
}

try {
    var source = standardInput();
    var payload = source.trim() ? JSON.parse(source) : {};
    if (!isObject(payload)) throw new Error("Hook payload must be an object.");
    handle(hookEvent(), payload);
} catch (error) {
}

writeHookResponse();
