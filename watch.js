"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Monitor = exports.createMonitor = void 0;
const events_1 = require("events");
const chokidar_1 = __importDefault(require("chokidar"));
const crypto_1 = __importDefault(require("crypto"));
const path_1 = __importDefault(require("path"));
const promises_1 = __importDefault(require("fs/promises"));
const fs_1 = require("fs");
class Monitor extends events_1.EventEmitter {
    constructor(options) {
        super();
        this.options = options;
        this.start();
    }
    fileExists(filePath) {
        return __awaiter(this, void 0, void 0, function* () {
            return promises_1.default
                .stat(filePath)
                .then((f) => f.isFile())
                .catch(() => false);
        });
    }
    edit(file, srcExists = false) {
        return __awaiter(this, void 0, void 0, function* () {
            const [srcFileExists, dstFileExists] = yield Promise.all([
                srcExists || this.fileExists(path_1.default.join(this.options.srcFolder, file)),
                this.fileExists(path_1.default.join(this.options.dstFolder, file)),
            ]);
            if (srcFileExists) {
                this.copy(file, dstFileExists).catch((e) => {
                    this.emit("error", e);
                });
            }
        });
    }
    start() {
        return __awaiter(this, void 0, void 0, function* () {
            this.srcWatcher = chokidar_1.default.watch(this.options.srcFolder, this.options.watchOptions);
            this.dstWatcher = chokidar_1.default.watch(this.options.dstFolder, this.options.watchOptions);
            yield this.sync();
            this.srcWatcher.on("add", (file) => {
                const filePath = path_1.default.relative(this.options.srcFolder, file);
                this.emit("missingFile", filePath);
                this.edit(filePath);
            });
            this.srcWatcher.on("change", (file) => {
                const filePath = path_1.default.relative(this.options.srcFolder, file);
                this.emit("update", filePath);
                this.edit(filePath);
            });
            // this.srcWatcher.on("unlink", (file) => {
            // 	file = path.relative(this.options.srcFolder, file)
            // 	this.emit("missingFile", file)
            // 	this.remove(file).catch((e) => {
            // 		this.emit("error", e)
            // 	})
            // })
            this.dstWatcher.on("change", (file) => __awaiter(this, void 0, void 0, function* () {
                const filePath = path_1.default.relative(this.options.dstFolder, file);
                if (!(yield this.fileExists(path_1.default.join(this.options.srcFolder, filePath))))
                    return;
                this.emit("update", filePath);
                this.edit(filePath, true);
            }));
            this.dstWatcher.on("unlink", (file) => __awaiter(this, void 0, void 0, function* () {
                const filePath = path_1.default.relative(this.options.dstFolder, file);
                if (!(yield this.fileExists(path_1.default.join(this.options.srcFolder, filePath))))
                    return;
                this.emit("missingFile", filePath);
                this.edit(filePath, true);
            }));
            this.emit("ready");
        });
    }
    getFiles(folder) {
        return __awaiter(this, void 0, void 0, function* () {
            //read all files in folder recursively
            // return files with path relative to folder
            const files = [];
            const read = (folder) => __awaiter(this, void 0, void 0, function* () {
                const entries = yield promises_1.default.readdir(folder, { withFileTypes: true });
                for (const entry of entries) {
                    const src = path_1.default.join(folder, entry.name);
                    if (entry.isDirectory()) {
                        yield read(src);
                    }
                    else {
                        files.push(src.slice(folder.length + 1));
                    }
                }
            });
            yield read(folder);
            return files;
        });
    }
    getHash(file) {
        return __awaiter(this, void 0, void 0, function* () {
            // use pipe for files over 8MB
            const hash = crypto_1.default.createHash("sha1");
            const stat = yield promises_1.default.stat(file);
            if (stat.size > 8 * 1024 ** 2) {
                const stream = (0, fs_1.createReadStream)(file);
                stream.pipe(hash);
                yield new Promise((resolve) => stream.on("close", resolve));
            }
            else {
                const data = yield promises_1.default.readFile(file);
                hash.update(data);
            }
            return hash.digest("hex");
        });
    }
    copy(file, withBakup = true) {
        return __awaiter(this, void 0, void 0, function* () {
            yield Promise.all([
                promises_1.default.mkdir(path_1.default.dirname(path_1.default.join(this.options.dstFolder, file)), { recursive: true }),
                withBakup &&
                    promises_1.default.mkdir(path_1.default.dirname(path_1.default.join(this.options.bakFolder, file)), {
                        recursive: true,
                    }),
            ]);
            if (withBakup)
                yield promises_1.default.copyFile(path_1.default.join(this.options.dstFolder, file), path_1.default.join(this.options.bakFolder, file));
            // copy src to dst
            yield promises_1.default.copyFile(path_1.default.join(this.options.srcFolder, file), path_1.default.join(this.options.dstFolder, file));
        });
    }
    sync() {
        return __awaiter(this, void 0, void 0, function* () {
            // check if src and dst are in sync
            // if not, backup mismatch files in dst and copy src to dst
            // use sha1
            // const bakFiles
            const [srcFiles, dstFiles] = yield Promise.all([
                this.getFiles(this.options.srcFolder),
                this.getFiles(this.options.dstFolder),
            ]);
            const srcOnly = srcFiles.filter((f) => !dstFiles.includes(f));
            const duplicates = srcFiles.filter((f) => dstFiles.includes(f));
            // copy srcOnly to dst
            yield Promise.all(srcOnly.map((f) => {
                this.emit("missingFile", f);
                return this.copy(f, false).catch((e) => {
                    this.emit("error", e);
                });
            }));
            // check duplicates
            for (const file of duplicates) {
                const [srcHash, dstHash] = yield Promise.all([
                    this.getHash(path_1.default.join(this.options.srcFolder, file)),
                    this.getHash(path_1.default.join(this.options.dstFolder, file)),
                ]);
                if (srcHash !== dstHash) {
                    this.emit("update", file);
                    // backup dst
                    yield this.copy(file).catch((e) => {
                        this.emit("error", e);
                    });
                }
            }
        });
    }
}
exports.Monitor = Monitor;
/**
 * @deprecated
 */
const createMonitor = (options) => __awaiter(void 0, void 0, void 0, function* () {
    const monit = new Monitor(options);
    yield new Promise((resolve) => {
        monit.once("ready", () => {
            resolve();
        });
    });
    return monit;
});
exports.createMonitor = createMonitor;
exports.default = Monitor;
