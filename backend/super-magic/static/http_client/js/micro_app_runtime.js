(function () {
    const MESSAGE_SOURCE = 'http-client-micro-app';
    const HOST_SOURCE = 'http-client-micro-app-host';
    const DEFAULT_TIMEOUT_MS = 30000;
    const WATCH_INTERVAL_MS = 3000;
    const MAX_WATCHERS = 10;

    let activeRuntime = null;

    function normalizePathSlashes(path) {
        return String(path || '').trim().replace(/\\/g, '/');
    }

    function isExternalUrl(value) {
        return /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(String(value || '').trim());
    }

    function stripQueryAndHash(value) {
        const text = String(value || '');
        const hashIndex = text.indexOf('#');
        const queryIndex = text.indexOf('?');
        const cutIndex = [hashIndex, queryIndex].filter(i => i >= 0).sort((a, b) => a - b)[0];
        return cutIndex >= 0 ? text.slice(0, cutIndex) : text;
    }

    function joinPath(baseDir, path) {
        const raw = normalizePathSlashes(stripQueryAndHash(path));
        if (!raw || isExternalUrl(raw)) return '';
        const input = raw.startsWith('./') ? raw.slice(2) : raw;
        const parts = [];
        const source = input.startsWith('/')
            ? input.slice(1).split('/')
            : (baseDir ? `${baseDir}/${input}` : input).split('/');
        for (const part of source) {
            if (!part || part === '.') continue;
            if (part === '..') {
                parts.pop();
                continue;
            }
            parts.push(part);
        }
        return parts.join('/');
    }

    function dirname(path) {
        const normalized = normalizePathSlashes(path);
        const index = normalized.lastIndexOf('/');
        return index >= 0 ? normalized.slice(0, index) : '';
    }

    function basename(path) {
        const normalized = normalizePathSlashes(path);
        const index = normalized.lastIndexOf('/');
        return index >= 0 ? normalized.slice(index + 1) : normalized;
    }

    function extensionOf(path) {
        const name = basename(stripQueryAndHash(path)).toLowerCase();
        const index = name.lastIndexOf('.');
        return index > 0 ? name.slice(index + 1) : '';
    }

    function mimeFromPath(path) {
        const ext = extensionOf(path);
        const map = {
            html: 'text/html',
            htm: 'text/html',
            js: 'text/javascript',
            mjs: 'text/javascript',
            css: 'text/css',
            json: 'application/json',
            svg: 'image/svg+xml',
            png: 'image/png',
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            gif: 'image/gif',
            webp: 'image/webp',
            txt: 'text/plain',
            md: 'text/markdown',
            wav: 'audio/wav',
            mp3: 'audio/mpeg',
            mp4: 'video/mp4',
            webm: 'video/webm',
            pdf: 'application/pdf',
        };
        return map[ext] || 'application/octet-stream';
    }

    function escapeScriptText(text) {
        return String(text || '').replace(/<\/script/gi, '<\\/script');
    }

    function isBinaryContent(content) {
        return typeof Blob !== 'undefined' && content instanceof Blob
            || typeof ArrayBuffer !== 'undefined' && content instanceof ArrayBuffer
            || ArrayBuffer.isView && ArrayBuffer.isView(content);
    }

    function blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const result = String(reader.result || '');
                const commaIndex = result.indexOf(',');
                resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
            };
            reader.onerror = () => reject(reader.error || new Error('Failed to read binary content'));
            reader.readAsDataURL(blob);
        });
    }

    function binaryContentToBlob(content) {
        if (typeof Blob !== 'undefined' && content instanceof Blob) return content;
        if (typeof ArrayBuffer !== 'undefined' && content instanceof ArrayBuffer) return new Blob([content]);
        if (ArrayBuffer.isView && ArrayBuffer.isView(content)) return new Blob([content.buffer]);
        return null;
    }

    function createIframeRuntimeScript(appBasePath) {
        return `
<script>
(function () {
    if (window.Magic && window.Magic.__httpClientRuntime) return;
    var SOURCE = ${JSON.stringify(MESSAGE_SOURCE)};
    var HOST_SOURCE = ${JSON.stringify(HOST_SOURCE)};
    var DEFAULT_TIMEOUT_MS = ${DEFAULT_TIMEOUT_MS};
    var seq = 0;
    var pending = {};
    var watchers = {};

    function nextRequestId() {
        seq += 1;
        return 'micro_app_req_' + Date.now() + '_' + seq;
    }

    function request(type, payload, options) {
        var requestId = nextRequestId();
        var timeoutMs = options && options.timeoutMs ? options.timeoutMs : DEFAULT_TIMEOUT_MS;
        return new Promise(function (resolve, reject) {
            var timer = setTimeout(function () {
                delete pending[requestId];
                reject(new Error(type + ' timeout after ' + timeoutMs + 'ms'));
            }, timeoutMs);
            pending[requestId] = { resolve: resolve, reject: reject, timer: timer };
            var body = payload || {};
            window.parent.postMessage(Object.assign({
                requestId: requestId,
                type: type,
                payload: body
            }, body), '*');
        });
    }

    function postOneWay(type, payload) {
        window.parent.postMessage(Object.assign({
            type: type,
            timestamp: Date.now()
        }, payload || {}), '*');
    }

    function normalizeListedFiles(files) {
        if (!Array.isArray(files)) return [];
        return files.map(function (item) {
            if (typeof item === 'string') return item;
            if (item && typeof item.name === 'string') return item.name;
            if (item && typeof item.file_name === 'string') return item.file_name;
            if (item && typeof item.path === 'string') return item.path.split('/').filter(Boolean).pop() || item.path;
            if (item && typeof item.relative_file_path === 'string') return item.relative_file_path.split('/').filter(Boolean).pop() || item.relative_file_path;
            return '';
        }).filter(Boolean);
    }

    function validateSingleFileName(newName) {
        return typeof newName === 'string'
            && newName.trim().length > 0
            && !/[\\\\/]/.test(newName)
            && newName.indexOf('..') < 0
            && !/[\\x00-\\x1F\\x7F]/.test(newName);
    }

    function toAgentPayload(message, options) {
        if (message && typeof message === 'object' && !message.type && arguments.length === 1) {
            return message;
        }
        return Object.assign({}, options || {}, { message: message });
    }

    function uploadFiles(files) {
        if (!Array.isArray(files)) return Promise.reject(new Error('uploadFiles: files must be an array'));
        if (!files.length) return Promise.reject(new Error('window.Magic.uploadFiles: files array cannot be empty'));
        return request('MAGIC_UPLOAD_FILES_REQUEST', { files: files }, { timeoutMs: 60000 }).then(function (r) { return r.results || r.result || r; });
    }

    function addFilesToMessage(filePaths, agentMode) {
        if (!Array.isArray(filePaths)) return Promise.reject(new Error('addFilesToMessage: filePaths must be an array'));
        if (!filePaths.length) return Promise.reject(new Error('addFilesToMessage: filePaths array cannot be empty'));
        return request('MAGIC_ADD_FILES_TO_MESSAGE_REQUEST', { filePaths: filePaths, agentMode: agentMode }).then(function (r) { return r.result || r; });
    }

    function downloadFiles(filePaths) {
        if (!Array.isArray(filePaths)) return Promise.reject(new Error('downloadFiles: filePaths must be an array'));
        if (!filePaths.length) return Promise.reject(new Error('downloadFiles: filePaths array cannot be empty'));
        return request('MAGIC_DOWNLOAD_FILES_REQUEST', { filePaths: filePaths }, { timeoutMs: 30000 }).then(function (r) { return r.result || r; });
    }

    function getAgents() {
        return request('MAGIC_GET_AGENTS_REQUEST').then(function (r) { return r.agents || []; });
    }

    function createTopicAndSend(message, options) {
        return request('MAGIC_CREATE_TOPIC_AND_SEND_REQUEST', toAgentPayload(message, options), { timeoutMs: 120000 }).then(function (r) {
            return { topicId: r.topicId || r.messageId || '' };
        });
    }

    function sendMessage(message, options) {
        return request('MAGIC_SEND_MESSAGE_REQUEST', toAgentPayload(message, options), { timeoutMs: 120000 }).then(function () {});
    }

    window.addEventListener('message', function (event) {
        var data = event.data || {};
        if (data.source && data.source !== HOST_SOURCE) return;
        if (data.type === 'MAGIC_FS_FILE_CHANGED') {
            var watchId = data.watchId || data.requestId;
            if (watchId && watchers[watchId]) {
                try { watchers[watchId](data.payload || data || {}); } catch (error) { console.error(error); }
            }
            return;
        }
        var item = data.requestId && pending[data.requestId];
        if (!item) return;
        clearTimeout(item.timer);
        delete pending[data.requestId];
        if (data.ok || data.success) {
            item.resolve(data.payload || data);
        } else {
            var message = data.error && data.error.message ? data.error.message : (typeof data.error === 'string' ? data.error : 'Magic host request failed');
            var error = new Error(message);
            error.code = data.error && data.error.code ? data.error.code : 'HOST_ERROR';
            item.reject(error);
        }
    });

    function watchFile(path, callback) {
        if (typeof callback !== 'function') {
            throw new Error('watchFile: callback must be a function');
        }
        var watchId = nextRequestId();
        watchers[watchId] = callback;
        request('MAGIC_FS_WATCH_REGISTER', { path: path, watchId: watchId }).catch(function (error) {
            delete watchers[watchId];
            console.error(error);
        });
        return function () {
            delete watchers[watchId];
            request('MAGIC_FS_WATCH_UNREGISTER', { watchId: watchId }).catch(function () {});
        };
    }

    window.Magic = {
        __httpClientRuntime: true,
        getAppBasePath: function () {
            return Promise.resolve(${JSON.stringify(appBasePath)});
        },
        reload: function () {
            postOneWay('MAGIC_RELOAD_REQUEST');
        },
        setInputMessage: function (message) {
            if (typeof message !== 'string') return;
            postOneWay('MAGIC_SET_INPUT_MESSAGE', { message: message });
        },
        uploadFiles: uploadFiles,
        downloadFiles: downloadFiles,
        addFilesToMessage: addFilesToMessage,
        getAgents: getAgents,
        createTopicAndSend: createTopicAndSend,
        sendMessage: sendMessage,
        fs: {
            readFile: function (path) { return request('MAGIC_FS_READ_REQUEST', { path: path }).then(function (r) { return r.content; }); },
            writeFile: function (path, content) { return request('MAGIC_FS_WRITE_REQUEST', { path: path, content: content }); },
            listFiles: function (dir) { return request('MAGIC_FS_LIST_REQUEST', { dir: dir == null ? './' : dir, path: dir == null ? './' : dir }).then(function (r) { return normalizeListedFiles(r.files || []); }); },
            deleteFile: function (path) { return request('MAGIC_FS_DELETE_FILE_REQUEST', { path: path }); },
            deleteDir: function (path) { return request('MAGIC_FS_DELETE_DIR_REQUEST', { path: path }); },
            renameFile: function (path, newName) {
                if (!validateSingleFileName(newName)) return Promise.reject(new Error('renameFile: newName must be a single file name'));
                return request('MAGIC_FS_RENAME_FILE_REQUEST', { path: path, newName: newName });
            },
            moveFile: function (path, targetDir) { return request('MAGIC_FS_MOVE_FILE_REQUEST', { path: path, sourcePath: path, targetDir: targetDir }); },
            watchFile: watchFile
        },
        agent: {
            getAgents: getAgents
        },
        project: {
            uploadFiles: uploadFiles,
            downloadFiles: downloadFiles,
            addFilesToMessage: addFilesToMessage,
            createTopicAndSend: createTopicAndSend,
            sendMessage: sendMessage
        },
        llm: {
            getModels: function () { return request('MAGIC_LLM_GET_MODELS_REQUEST').then(function (r) { return r.models || []; }); },
            chat: function (messages, options) { return request('MAGIC_LLM_CHAT_REQUEST', { messages: messages || [], options: options || {} }, { timeoutMs: 120000 }).then(function (r) { return typeof r.content === 'string' ? r.content : String(r.content || ''); }); },
            stream: function (messages, onChunk, options) {
                request('MAGIC_LLM_CHAT_REQUEST', { messages: messages || [], options: Object.assign({}, options || {}, { stream: true }) }, { timeoutMs: 120000 }).then(function (r) {
                    if (typeof onChunk === 'function') onChunk(typeof r.content === 'string' ? r.content : String(r.content || ''), true);
                }).catch(function () {
                    if (typeof onChunk === 'function') onChunk('', true);
                });
                return function () {};
            }
        },
        user: {
            getInfo: function (options) { return request('MAGIC_GET_USER_INFO_REQUEST', options || {}).then(function (r) { return r.userInfo || r.user || r; }); }
        }
    };
    window.dispatchEvent(new CustomEvent('magic-ready', { detail: { runtime: 'http_client' } }));
})();
<\/script>`;
    }

    class MicroAppRuntime {
        constructor(options) {
            this.container = options.container;
            this.appRootHandle = options.appRootHandle;
            this.appRootPath = options.appRootPath || '';
            this.entryPath = options.entryPath || 'index.html';
            this.entryHandle = options.entryHandle;
            this.appConfig = options.appConfig || {};
            this.workspaceApi = options.workspaceApi || null;
            this.serverUrlProvider = options.serverUrlProvider;
            this.sendAgentMessage = options.sendAgentMessage;
            this.fillMessageDraft = options.fillMessageDraft;
            this.setInputMessage = options.setInputMessage;
            this.uploadWorkspaceFiles = options.uploadWorkspaceFiles;
            this.addFilesToMessage = options.addFilesToMessage;
            this.downloadWorkspaceFiles = options.downloadWorkspaceFiles;
            this.refreshFileTree = options.refreshFileTree;
            this.logTarget = null;
            this.iframe = null;
            this.resourceUrls = [];
            this.watchers = new Map();
            this.disposed = false;
            this.onMessage = this.onMessage.bind(this);
        }

        async mount() {
            this.dispose();
            this.disposed = false;
            this.container.innerHTML = '';

            const shell = document.createElement('div');
            shell.className = 'micro-app-runtime-shell';
            const iframe = document.createElement('iframe');
            iframe.className = 'micro-app-runtime-frame';
            iframe.title = this.appConfig.name || this.entryPath;
            iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-downloads');

            const details = document.createElement('details');
            details.className = 'micro-app-runtime-debug';
            const summary = document.createElement('summary');
            summary.textContent = '微应用调试日志';
            const log = document.createElement('div');
            log.className = 'micro-app-runtime-log';
            details.appendChild(summary);
            details.appendChild(log);

            shell.appendChild(iframe);
            shell.appendChild(details);
            this.container.appendChild(shell);
            this.iframe = iframe;
            this.logTarget = log;
            window.addEventListener('message', this.onMessage);

            const html = await this.buildHtmlContent();
            iframe.srcdoc = html;
            this.log('runtime', 'mounted', { appRootPath: this.appRootPath, entryPath: this.entryPath });
        }

        dispose() {
            this.disposed = true;
            window.removeEventListener('message', this.onMessage);
            for (const watcher of this.watchers.values()) {
                clearInterval(watcher.timer);
            }
            this.watchers.clear();
            for (const url of this.resourceUrls) {
                URL.revokeObjectURL(url);
            }
            this.resourceUrls = [];
        }

        log(type, message, data) {
            if (!this.logTarget) return;
            const row = document.createElement('div');
            row.className = `micro-app-runtime-log-row micro-app-runtime-log-${type}`;
            const time = new Date().toLocaleTimeString();
            row.textContent = `[${time}] ${message}${data ? ' ' + JSON.stringify(data) : ''}`;
            this.logTarget.appendChild(row);
            this.logTarget.scrollTop = this.logTarget.scrollHeight;
        }

        async buildHtmlContent() {
            const original = this.workspaceApi
                ? (await this.readFile(this.entryPath)).content
                : await (await this.entryHandle.getFile()).text();
            const baseDir = dirname(this.entryPath);
            const processed = await this.rewriteHtmlResources(original, baseDir);
            const runtimeScript = createIframeRuntimeScript(this.appRootPath);
            if (/<\/head>/i.test(processed)) {
                return processed.replace(/<\/head>/i, `${runtimeScript}\n</head>`);
            }
            if (/<\/body>/i.test(processed)) {
                return processed.replace(/<\/body>/i, `${runtimeScript}\n</body>`);
            }
            return `${runtimeScript}\n${processed}`;
        }

        async rewriteHtmlResources(html, baseDir) {
            let output = html;
            output = await this.replaceAttrUrls(output, /\b(src|href)=["']([^"']+)["']/gi, baseDir);
            output = await this.replaceInlineStyleUrls(output, baseDir);
            return output;
        }

        async replaceAttrUrls(html, regex, baseDir) {
            const replacements = [];
            let match;
            while ((match = regex.exec(html)) !== null) {
                const attr = match[1];
                const rawUrl = match[2];
                if (isExternalUrl(rawUrl) || rawUrl.startsWith('data:') || rawUrl.startsWith('blob:')) continue;
                const resolvedPath = joinPath(baseDir, rawUrl);
                if (!resolvedPath) continue;
                try {
                    const blobUrl = await this.createBlobUrlForAppPath(resolvedPath);
                    replacements.push({ from: match[0], to: `${attr}="${blobUrl}"` });
                } catch (error) {
                    this.log('warn', 'resource skipped', { path: resolvedPath, error: error.message });
                }
            }
            let output = html;
            for (const item of replacements) {
                output = output.replace(item.from, item.to);
            }
            return output;
        }

        async replaceInlineStyleUrls(html, baseDir) {
            const styleRegex = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
            const blocks = [];
            let match;
            while ((match = styleRegex.exec(html)) !== null) {
                const css = await this.rewriteCssUrls(match[1], baseDir);
                blocks.push({ from: match[0], to: match[0].replace(match[1], css) });
            }
            let output = html;
            for (const item of blocks) {
                output = output.replace(item.from, item.to);
            }
            return output;
        }

        async rewriteCssUrls(css, baseDir) {
            const regex = /url\((['"]?)([^'")]+)\1\)/gi;
            const replacements = [];
            let match;
            while ((match = regex.exec(css)) !== null) {
                const rawUrl = match[2];
                if (isExternalUrl(rawUrl) || rawUrl.startsWith('data:') || rawUrl.startsWith('blob:')) continue;
                const resolvedPath = joinPath(baseDir, rawUrl);
                if (!resolvedPath) continue;
                try {
                    const blobUrl = await this.createBlobUrlForAppPath(resolvedPath);
                    replacements.push({ from: match[0], to: `url("${blobUrl}")` });
                } catch (error) {
                    this.log('warn', 'css resource skipped', { path: resolvedPath, error: error.message });
                }
            }
            let output = css;
            for (const item of replacements) {
                output = output.replace(item.from, item.to);
            }
            return output;
        }

        async createBlobUrlForAppPath(appPath) {
            if (this.workspaceApi) {
                const rawUrl = this.workspaceApi.rawUrl(this.workspacePath(appPath));
                const response = await fetch(rawUrl, { cache: 'no-store' });
                if (!response.ok) {
                    throw new Error(`Failed to fetch resource: ${appPath}`);
                }
                let blob = await response.blob();
                if (extensionOf(appPath) === 'css') {
                    const css = await this.rewriteCssUrls(await blob.text(), dirname(appPath));
                    blob = new Blob([css], { type: 'text/css' });
                }
                const url = URL.createObjectURL(blob);
                this.resourceUrls.push(url);
                return url;
            }
            const fileHandle = await this.getFileHandle(appPath, false);
            const file = await fileHandle.getFile();
            let blob = file;
            if (extensionOf(appPath) === 'css') {
                const css = await this.rewriteCssUrls(await file.text(), dirname(appPath));
                blob = new Blob([css], { type: 'text/css' });
            } else if (!file.type) {
                blob = new Blob([file], { type: mimeFromPath(appPath) });
            }
            const url = URL.createObjectURL(blob);
            this.resourceUrls.push(url);
            return url;
        }

        async onMessage(event) {
            if (!this.iframe || event.source !== this.iframe.contentWindow) return;
            const data = event.data || {};
            if (data.source && data.source !== MESSAGE_SOURCE) return;
            const type = data.type;
            if (!data.requestId) {
                this.log('request', type, data);
                this.handleOneWayMessage(type, data);
                return;
            }
            const payload = data.payload || data;
            this.log('request', type, payload);
            try {
                const result = await this.dispatch(type, payload);
                this.respond(data.requestId, type, true, result || {});
                this.log('response', type, result || {});
            } catch (error) {
                const responseError = {
                    code: error.code || 'MICRO_APP_RUNTIME_ERROR',
                    message: error.message || String(error),
                };
                this.respond(data.requestId, type, false, null, responseError);
                this.log('error', type, responseError);
            }
        }

        respond(requestId, type, ok, payload, error) {
            if (!this.iframe || !this.iframe.contentWindow) return;
            this.iframe.contentWindow.postMessage(Object.assign({
                requestId,
                type: type.replace(/_REQUEST$/, '_RESPONSE'),
                ok,
                success: ok,
                payload: payload || {},
                error: error || null,
            }, payload || {}), '*');
        }

        handleOneWayMessage(type, payload) {
            if (type === 'MAGIC_RELOAD_REQUEST') {
                setTimeout(() => {
                    this.mount().catch(error => this.log('error', 'reload failed', { error: error.message }));
                }, 0);
                return;
            }
            if (type === 'MAGIC_SET_INPUT_MESSAGE') {
                this.setMessageInput(payload).catch(error => this.log('error', type, { error: error.message }));
            }
        }

        async dispatch(type, payload) {
            switch (type) {
                case 'MAGIC_FS_GET_APP_BASE_PATH_REQUEST':
                    return { content: this.appRootPath || '' };
                case 'MAGIC_FS_READ_REQUEST':
                    return this.readFile(payload.path);
                case 'MAGIC_FS_WRITE_REQUEST':
                    return this.writeFile(payload.path, payload.content);
                case 'MAGIC_FS_WRITE_BLOB_REQUEST':
                    return this.writeFile(payload.path, payload.blob);
                case 'MAGIC_FS_RAW_URL_REQUEST':
                    return this.getFileUrl(payload.path);
                case 'MAGIC_FS_LIST_REQUEST':
                    return this.listFiles(payload.dir || payload.path);
                case 'MAGIC_FS_DELETE_REQUEST':
                case 'MAGIC_FS_DELETE_FILE_REQUEST':
                    return this.deleteFile(payload.path);
                case 'MAGIC_FS_DELETE_DIR_REQUEST':
                    return this.deleteDir(payload.path);
                case 'MAGIC_FS_RENAME_REQUEST':
                case 'MAGIC_FS_RENAME_FILE_REQUEST':
                    return this.renameFile(payload.path, payload.newName);
                case 'MAGIC_FS_MOVE_REQUEST':
                case 'MAGIC_FS_MOVE_FILE_REQUEST':
                    return this.moveFile(payload.sourcePath || payload.path, payload.targetDir);
                case 'MAGIC_FS_WATCH_REGISTER':
                    return this.registerWatcher(payload.path, payload.watchId);
                case 'MAGIC_FS_WATCH_UNREGISTER':
                    return this.unregisterWatcher(payload.watchId);
                case 'MAGIC_RELOAD_REQUEST':
                    setTimeout(() => {
                        this.mount().catch(error => this.log('error', 'reload failed', { error: error.message }));
                    }, 0);
                    return { reloaded: true };
                case 'MAGIC_GET_AGENTS_REQUEST':
                    return this.getAgents();
                case 'MAGIC_CREATE_TOPIC_AND_SEND_REQUEST':
                    return this.createTopicAndSend(payload);
                case 'MAGIC_SEND_MESSAGE_REQUEST':
                    return this.createTopicAndSend(payload);
                case 'MAGIC_SET_INPUT_MESSAGE_REQUEST':
                    return this.setMessageInput(payload);
                case 'MAGIC_DRAFT_MESSAGE_REQUEST':
                    return this.draftMessage(payload);
                case 'MAGIC_UPLOAD_FILES_REQUEST':
                    return this.uploadFiles(payload);
                case 'MAGIC_ADD_FILES_TO_MESSAGE_REQUEST':
                    return this.addFilesToMessageRequest(payload);
                case 'MAGIC_DOWNLOAD_FILES_REQUEST':
                    return this.downloadFiles(payload);
                case 'MAGIC_LLM_GET_MODELS_REQUEST':
                    return this.getModels();
                case 'MAGIC_LLM_CHAT_REQUEST':
                    return { content: '[mock] http_client 本地微应用运行时暂未接入真实 llm.chat', implementation: 'mock' };
                case 'MAGIC_GET_USER_INFO_REQUEST':
                    return this.getUserInfo(payload);
                default:
                    throw Object.assign(new Error(`Unsupported runtime message: ${type}`), { code: 'NOT_IMPLEMENTED' });
            }
        }

        resolveAppPath(inputPath) {
            let raw = normalizePathSlashes(inputPath || '.');
            if (this.appConfig.files && typeof this.appConfig.files === 'object' && this.appConfig.files[raw]) {
                raw = this.appConfig.files[raw];
            }
            if (raw.startsWith('/')) {
                throw Object.assign(new Error('Workspace-root absolute paths are disabled in http_client runtime'), { code: 'PATH_SCOPE_DENIED' });
            }
            const parts = raw.split('/').filter(Boolean);
            const normalized = [];
            for (const part of parts) {
                if (part === '.') continue;
                if (part === '..') {
                    throw Object.assign(new Error(`Path escapes app root: ${inputPath}`), { code: 'PATH_ESCAPE_DENIED' });
                }
                if (/[\u0000-\u001f]/.test(part)) {
                    throw Object.assign(new Error(`Invalid path segment: ${part}`), { code: 'INVALID_PATH' });
                }
                normalized.push(part);
            }
            return normalized.join('/');
        }

        workspacePath(appPath) {
            const resolved = this.resolveAppPath(appPath || '.');
            if (!this.appRootPath) return resolved;
            return resolved ? `${this.appRootPath}/${resolved}` : this.appRootPath;
        }

        async getDirectoryHandle(appPath, create) {
            const normalized = this.resolveAppPath(appPath || '.');
            const parts = normalized ? normalized.split('/').filter(Boolean) : [];
            let dir = this.appRootHandle;
            for (const part of parts) {
                dir = await dir.getDirectoryHandle(part, { create: !!create });
            }
            return dir;
        }

        async getFileHandle(appPath, create) {
            const normalized = this.resolveAppPath(appPath);
            if (!normalized) {
                throw Object.assign(new Error('File path is required'), { code: 'INVALID_PATH' });
            }
            const parts = normalized.split('/').filter(Boolean);
            let dir = this.appRootHandle;
            for (const part of parts.slice(0, -1)) {
                dir = await dir.getDirectoryHandle(part, { create: !!create });
            }
            return await dir.getFileHandle(parts[parts.length - 1], { create: !!create });
        }

        async ensureWritePermission() {
            if (!this.appRootHandle || typeof this.appRootHandle.queryPermission !== 'function') return;
            const current = await this.appRootHandle.queryPermission({ mode: 'readwrite' });
            if (current === 'granted') return;
            const next = await this.appRootHandle.requestPermission({ mode: 'readwrite' });
            if (next !== 'granted') {
                throw Object.assign(new Error('Write permission denied for micro-app directory'), { code: 'WRITE_PERMISSION_DENIED' });
            }
        }

        async readFile(path) {
            if (this.workspaceApi) {
                const result = await this.workspaceApi.readFile(this.workspacePath(path));
                return Object.assign({}, result, {
                    path: this.resolveAppPath(path),
                    implementation: 'real',
                });
            }
            const fileHandle = await this.getFileHandle(path, false);
            const file = await fileHandle.getFile();
            return {
                content: await file.text(),
                path: this.resolveAppPath(path),
                size: file.size,
                updatedAt: file.lastModified,
                implementation: 'local-adapter',
            };
        }

        async writeFile(path, content) {
            if (this.workspaceApi) {
                const binaryBlob = binaryContentToBlob(content);
                if (binaryBlob) {
                    const normalized = this.resolveAppPath(path);
                    const targetDir = dirname(this.workspacePath(normalized));
                    const filename = basename(normalized);
                    const result = await this.workspaceApi.uploadFile(targetDir, filename, await blobToBase64(binaryBlob), true);
                    if (this.refreshFileTree) await this.refreshFileTree();
                    return Object.assign({}, result, {
                        path: normalized,
                        implementation: 'real',
                    });
                }
                const result = await this.workspaceApi.writeFile(this.workspacePath(path), String(content == null ? '' : content));
                if (this.refreshFileTree) await this.refreshFileTree();
                return Object.assign({}, result, {
                    path: this.resolveAppPath(path),
                    implementation: 'real',
                });
            }
            await this.ensureWritePermission();
            const fileHandle = await this.getFileHandle(path, true);
            const writable = await fileHandle.createWritable();
            const binaryBlob = binaryContentToBlob(content);
            await writable.write(binaryBlob || String(content == null ? '' : content));
            await writable.close();
            if (this.refreshFileTree) await this.refreshFileTree();
            return { path: this.resolveAppPath(path), implementation: 'local-adapter' };
        }

        async getFileUrl(path) {
            const normalized = this.resolveAppPath(path);
            if (this.workspaceApi) {
                return {
                    url: this.workspaceApi.rawUrl(this.workspacePath(normalized)),
                    path: normalized,
                    implementation: 'real',
                };
            }
            const fileHandle = await this.getFileHandle(normalized, false);
            const file = await fileHandle.getFile();
            const blob = file.type ? file : new Blob([file], { type: mimeFromPath(normalized) });
            const url = URL.createObjectURL(blob);
            this.resourceUrls.push(url);
            return { url, path: normalized, implementation: 'local-adapter' };
        }

        async listFiles(path) {
            if (this.workspaceApi) {
                const appPath = this.resolveAppPath(path || '.');
                const result = await this.workspaceApi.listTree(this.workspacePath(appPath), 1);
                const files = (result.entries || []).map(item => ({
                    name: item.name,
                    path: item.path && this.appRootPath && item.path.startsWith(`${this.appRootPath}/`)
                        ? item.path.slice(this.appRootPath.length + 1) + (item.type === 'directory' ? '/' : '')
                        : item.path,
                    type: item.type,
                    size: item.size,
                    updatedAt: item.updated_at,
                }));
                return { files, implementation: 'real' };
            }
            const normalized = this.resolveAppPath(path || '.');
            const dir = await this.getDirectoryHandle(normalized || '.', false);
            const files = [];
            for await (const entry of dir.values()) {
                if (entry.kind === 'file') {
                    const file = await entry.getFile();
                    files.push({
                        name: entry.name,
                        path: normalized ? `${normalized}/${entry.name}` : entry.name,
                        type: 'file',
                        size: file.size,
                        updatedAt: file.lastModified,
                    });
                } else {
                    files.push({
                        name: entry.name,
                        path: normalized ? `${normalized}/${entry.name}/` : `${entry.name}/`,
                        type: 'directory',
                    });
                }
            }
            files.sort((a, b) => {
                if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
                return a.name.localeCompare(b.name);
            });
            return { files, implementation: 'local-adapter' };
        }

        async deleteFile(path) {
            if (this.workspaceApi) {
                const result = await this.workspaceApi.deletePath(this.workspacePath(path), false);
                if (this.refreshFileTree) await this.refreshFileTree();
                return Object.assign({}, result, {
                    path: this.resolveAppPath(path),
                    implementation: 'real',
                });
            }
            await this.ensureWritePermission();
            const normalized = this.resolveAppPath(path);
            const parts = normalized.split('/').filter(Boolean);
            let dir = this.appRootHandle;
            for (const part of parts.slice(0, -1)) {
                dir = await dir.getDirectoryHandle(part);
            }
            await dir.removeEntry(parts[parts.length - 1]);
            if (this.refreshFileTree) await this.refreshFileTree();
            return { path: normalized, implementation: 'local-adapter' };
        }

        async deleteDir(path) {
            if (this.workspaceApi) {
                const result = await this.workspaceApi.deletePath(this.workspacePath(path), true);
                if (this.refreshFileTree) await this.refreshFileTree();
                return Object.assign({}, result, {
                    path: this.resolveAppPath(path),
                    implementation: 'real',
                });
            }
            await this.ensureWritePermission();
            const normalized = this.resolveAppPath(path);
            const parts = normalized.split('/').filter(Boolean);
            let dir = this.appRootHandle;
            for (const part of parts.slice(0, -1)) {
                dir = await dir.getDirectoryHandle(part);
            }
            await dir.removeEntry(parts[parts.length - 1], { recursive: true });
            if (this.refreshFileTree) await this.refreshFileTree();
            return { path: normalized, implementation: 'local-adapter' };
        }

        async renameFile(path, newName) {
            if (!newName || /[\\/]/.test(newName) || newName === '.' || newName === '..') {
                throw Object.assign(new Error('renameFile: newName must be a single file name'), { code: 'INVALID_PATH' });
            }
            if (this.workspaceApi) {
                const normalized = this.resolveAppPath(path);
                const targetPath = dirname(normalized) ? `${dirname(normalized)}/${newName}` : newName;
                const result = await this.workspaceApi.movePath(this.workspacePath(normalized), this.workspacePath(targetPath), false);
                if (this.refreshFileTree) await this.refreshFileTree();
                return Object.assign({}, result, { path: targetPath, implementation: 'real' });
            }
            const normalized = this.resolveAppPath(path);
            const source = await this.readFile(normalized);
            const targetPath = dirname(normalized) ? `${dirname(normalized)}/${newName}` : newName;
            await this.writeFile(targetPath, source.content);
            await this.deleteFile(normalized);
            return { path: targetPath, implementation: 'local-adapter' };
        }

        async moveFile(sourcePath, targetDir) {
            if (this.workspaceApi) {
                const normalizedSource = this.resolveAppPath(sourcePath);
                const normalizedTargetDir = this.resolveAppPath(targetDir || '.');
                const targetPath = normalizedTargetDir ? `${normalizedTargetDir}/${basename(normalizedSource)}` : basename(normalizedSource);
                const result = await this.workspaceApi.movePath(this.workspacePath(normalizedSource), this.workspacePath(targetPath), false);
                if (this.refreshFileTree) await this.refreshFileTree();
                return Object.assign({}, result, { path: targetPath, implementation: 'real' });
            }
            const normalizedSource = this.resolveAppPath(sourcePath);
            const normalizedTargetDir = this.resolveAppPath(targetDir || '.');
            await this.getDirectoryHandle(normalizedTargetDir || '.', true);
            const source = await this.readFile(normalizedSource);
            const targetPath = normalizedTargetDir ? `${normalizedTargetDir}/${basename(normalizedSource)}` : basename(normalizedSource);
            await this.writeFile(targetPath, source.content);
            await this.deleteFile(normalizedSource);
            return { path: targetPath, implementation: 'local-adapter' };
        }

        async registerWatcher(path, watchId) {
            if (!watchId) {
                throw Object.assign(new Error('watchId is required'), { code: 'INVALID_WATCH' });
            }
            if (this.watchers.size >= MAX_WATCHERS) {
                throw Object.assign(new Error(`watchFile supports at most ${MAX_WATCHERS} active watchers`), { code: 'WATCH_LIMIT_EXCEEDED' });
            }
            const normalized = this.resolveAppPath(path);
            if (this.workspaceApi) {
                const initial = await this.workspaceApi.readFile(this.workspacePath(normalized));
                const watcher = { path: normalized, updatedAt: initial.updated_at, timer: null };
                watcher.timer = setInterval(async () => {
                    try {
                        const next = await this.workspaceApi.readFile(this.workspacePath(normalized));
                        if (next.updated_at === watcher.updatedAt) return;
                        watcher.updatedAt = next.updated_at;
                        this.postFileChanged(watchId, {
                            path: normalized,
                            updatedAt: next.updated_at,
                            size: next.size,
                            content: next.content,
                        });
                    } catch (error) {
                        this.postFileChanged(watchId, {
                            path: normalized,
                            error: error.message,
                        });
                    }
                }, WATCH_INTERVAL_MS);
                this.watchers.set(watchId, watcher);
                return { watchId, path: normalized, implementation: 'real' };
            }
            const fileHandle = await this.getFileHandle(normalized, false);
            const initialFile = await fileHandle.getFile();
            const watcher = { path: normalized, lastModified: initialFile.lastModified, timer: null };
            watcher.timer = setInterval(async () => {
                try {
                    const file = await fileHandle.getFile();
                    if (file.lastModified === watcher.lastModified) return;
                    watcher.lastModified = file.lastModified;
                    this.postFileChanged(watchId, {
                        path: normalized,
                        updatedAt: file.lastModified,
                        size: file.size,
                        content: await file.text(),
                    });
                } catch (error) {
                    this.postFileChanged(watchId, {
                        path: normalized,
                        error: error.message,
                    });
                }
            }, WATCH_INTERVAL_MS);
            this.watchers.set(watchId, watcher);
            return { watchId, path: normalized, implementation: 'local-adapter' };
        }

        unregisterWatcher(watchId) {
            const watcher = this.watchers.get(watchId);
            if (watcher) {
                clearInterval(watcher.timer);
                this.watchers.delete(watchId);
            }
            return { watchId };
        }

        postFileChanged(watchId, payload) {
            if (!this.iframe || !this.iframe.contentWindow) return;
            this.iframe.contentWindow.postMessage(Object.assign({
                type: 'MAGIC_FS_FILE_CHANGED',
                requestId: watchId,
                watchId,
                payload,
            }, payload || {}), '*');
        }

        async getAgents() {
            const base = this.serverUrlProvider ? this.serverUrlProvider() : '';
            if (!base) return { agents: [], implementation: 'local-adapter' };
            const resp = await fetch(`${base.replace(/\/+$/, '')}/api/v1/debug/local-crew/list`);
            const json = await resp.json();
            const crews = json && json.data && Array.isArray(json.data.crews) ? json.data.crews : [];
            return {
                agents: crews.map(item => ({
                    id: item.agent_code || item.crew_dir || item.name,
                    name: item.name || item.crew_dir || item.agent_code,
                    agent_code: item.agent_code,
                    crew_dir: item.crew_dir,
                })),
                implementation: 'real',
            };
        }

        async getModels() {
            const base = this.serverUrlProvider ? this.serverUrlProvider() : '';
            if (!base) return { models: [], implementation: 'real' };
            const resp = await fetch(`${base.replace(/\/+$/, '')}/api/v1/models`);
            const json = await resp.json();
            const models = json && json.data && Array.isArray(json.data.models) ? json.data.models : [];
            return { models, implementation: 'real' };
        }

        getUserInfo(payload) {
            const scopes = Array.isArray(payload.scopes) ? payload.scopes : [];
            const userInfo = {
                name: 'Local Debug User',
                avatar: '',
                nickname: scopes.includes('user.profile.name') ? 'Local Debug User' : undefined,
                real_name: scopes.includes('user.profile.name') ? 'Local Debug User' : undefined,
                user_id: scopes.includes('user.profile.identity') ? 'local-debug-user' : undefined,
                magic_id: scopes.includes('user.profile.identity') ? 'local-debug-user' : undefined,
                organization_code: scopes.includes('user.profile.organization') ? 'local-debug-org' : undefined,
            };
            return {
                implementation: 'mock',
                scopes,
                userInfo,
                user: {
                    displayName: 'Local Debug User',
                    userId: 'local-debug-user',
                },
            };
        }

        async createTopicAndSend(payload) {
            if (!this.sendAgentMessage) {
                throw Object.assign(new Error('Agent message sender is not configured'), { code: 'NOT_IMPLEMENTED' });
            }
            const result = await this.sendAgentMessage(payload || {});
            return Object.assign({ implementation: 'real' }, result || {});
        }

        async uploadFiles(payload) {
            if (!this.uploadWorkspaceFiles) {
                throw Object.assign(new Error('Workspace file uploader is not configured'), { code: 'NOT_IMPLEMENTED' });
            }
            const results = await this.uploadWorkspaceFiles(Array.isArray(payload.files) ? payload.files : []);
            return { results, implementation: 'local-workspace' };
        }

        async addFilesToMessageRequest(payload) {
            if (!this.addFilesToMessage) {
                throw Object.assign(new Error('File mention writer is not configured'), { code: 'NOT_IMPLEMENTED' });
            }
            const result = await this.addFilesToMessage(Array.isArray(payload.filePaths) ? payload.filePaths : [], payload.agentMode);
            return { result, implementation: 'local-workspace' };
        }

        async downloadFiles(payload) {
            if (!this.downloadWorkspaceFiles) {
                throw Object.assign(new Error('Workspace file downloader is not configured'), { code: 'NOT_IMPLEMENTED' });
            }
            const result = await this.downloadWorkspaceFiles(Array.isArray(payload.filePaths) ? payload.filePaths : []);
            return { result, implementation: 'local-workspace' };
        }

        async draftMessage(payload) {
            if (!this.fillMessageDraft) {
                throw Object.assign(new Error('Message draft writer is not configured'), { code: 'NOT_IMPLEMENTED' });
            }
            const result = await this.fillMessageDraft(payload || {});
            return Object.assign({ implementation: 'local-draft' }, result || {});
        }

        async setMessageInput(payload) {
            if (!this.setInputMessage) {
                throw Object.assign(new Error('Message input writer is not configured'), { code: 'NOT_IMPLEMENTED' });
            }
            const result = await this.setInputMessage(payload && typeof payload.message === 'string' ? payload.message : '');
            return Object.assign({ implementation: 'local-input-message' }, result || {});
        }
    }

    window.MicroAppRuntimeHost = {
        async render(options) {
            if (activeRuntime) activeRuntime.dispose();
            activeRuntime = new MicroAppRuntime(options);
            await activeRuntime.mount();
            return activeRuntime;
        },
        dispose() {
            if (activeRuntime) activeRuntime.dispose();
            activeRuntime = null;
        },
    };
})();
