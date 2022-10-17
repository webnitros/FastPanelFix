import { EventEmitter } from "events"
import chokidar from "chokidar"
import crypto from "crypto"
import path from "path"
import fs from "fs/promises"
import { createReadStream } from "fs"

declare interface Monitor {
	on(event: "missingFile", listener: (file: string) => void): this
	on(event: "update", listener: (file: string) => void): this
	on(event: "error", listener: (e: any) => void): this
	on(event: "ready", listener: () => void): this
	on(event: string, listener: Function): this

	once(event: "missingFile", listener: (file: string) => void): this
	once(event: "update", listener: (file: string) => void): this
	once(event: "error", listener: (e: any) => void): this
	once(event: "ready", listener: () => void): this
	once(event: string, listener: Function): this
}

export type Options = {
	dstFolder: string
	srcFolder: string
	bakFolder: string
	watchOptions?: chokidar.WatchOptions
}

class Monitor extends EventEmitter {
	readonly options: Options
	srcWatcher!: chokidar.FSWatcher
	dstWatcher!: chokidar.FSWatcher
	constructor(options: Options) {
		super()
		this.options = options
		this.start()
	}
	async fileExists(filePath: string) {
		return fs
			.stat(filePath)
			.then((f) => f.isFile())
			.catch(() => false)
	}
	private async edit(file: string, srcExists: boolean = false) {
		const [srcFileExists, dstFileExists] = await Promise.all([
			srcExists || this.fileExists(path.join(this.options.srcFolder, file)),
			this.fileExists(path.join(this.options.dstFolder, file)),
		])
		if (srcFileExists) {
			this.copy(file, dstFileExists).catch((e) => {
				this.emit("error", e)
			})
		}
	}

	private async start() {
		this.srcWatcher = chokidar.watch(this.options.srcFolder, this.options.watchOptions)
		this.dstWatcher = chokidar.watch(this.options.dstFolder, this.options.watchOptions)
		await this.sync()
		this.srcWatcher.on("add", (file: string) => {
			const filePath = path.relative(this.options.srcFolder, file)
			this.emit("missingFile", filePath)
			this.edit(filePath)
		})
		this.srcWatcher.on("change", (file) => {
			const filePath = path.relative(this.options.srcFolder, file)
			this.emit("update", filePath)
			this.edit(filePath)
		})
		// this.srcWatcher.on("unlink", (file) => {
		// 	file = path.relative(this.options.srcFolder, file)
		// 	this.emit("missingFile", file)
		// 	this.remove(file).catch((e) => {
		// 		this.emit("error", e)
		// 	})
		// })
		this.dstWatcher.on("change", async (file) => {
			const filePath = path.relative(this.options.dstFolder, file)
			if (!(await this.fileExists(path.join(this.options.srcFolder, filePath)))) return
			this.emit("update", filePath)
			this.edit(filePath, true)
		})
		this.dstWatcher.on("unlink", async (file) => {
			const filePath = path.relative(this.options.dstFolder, file)
			if (!(await this.fileExists(path.join(this.options.srcFolder, filePath)))) return
			this.emit("missingFile", filePath)
			this.edit(filePath, true)
		})
		this.emit("ready")
	}
	private async getFiles(folder: string): Promise<string[]> {
		//read all files in folder recursively
		// return files with path relative to folder
		const files: string[] = []
		const read = async (folder: string) => {
			const entries = await fs.readdir(folder, { withFileTypes: true })
			for (const entry of entries) {
				const src = path.join(folder, entry.name)
				if (entry.isDirectory()) {
					await read(src)
				} else {
					files.push(src.slice(folder.length + 1))
				}
			}
		}
		await read(folder)
		return files
	}
	private async getHash(file: string): Promise<string> {
		// use pipe for files over 8MB
		const hash = crypto.createHash("sha1")
		const stat = await fs.stat(file)
		if (stat.size > 8 * 1024 ** 2) {
			const stream = createReadStream(file)
			stream.pipe(hash)
			await new Promise((resolve) => stream.on("close", resolve))
		} else {
			const data = await fs.readFile(file)
			hash.update(data)
		}
		return hash.digest("hex")
	}
	private async copy(file: string, withBakup = true) {
		await Promise.all([
			fs.mkdir(path.dirname(path.join(this.options.dstFolder, file)), { recursive: true }),
			withBakup &&
				fs.mkdir(path.dirname(path.join(this.options.bakFolder, file)), {
					recursive: true,
				}),
		])
		if (withBakup)
			await fs.copyFile(
				path.join(this.options.dstFolder, file),
				path.join(this.options.bakFolder, file)
			)
		// copy src to dst
		await fs.copyFile(
			path.join(this.options.srcFolder, file),
			path.join(this.options.dstFolder, file)
		)
	}
	private async sync(): Promise<void> {
		// check if src and dst are in sync
		// if not, backup mismatch files in dst and copy src to dst
		// use sha1
		// const bakFiles
		const [srcFiles, dstFiles] = await Promise.all([
			this.getFiles(this.options.srcFolder),
			this.getFiles(this.options.dstFolder),
		])
		const srcOnly = srcFiles.filter((f) => !dstFiles.includes(f))
		const duplicates = srcFiles.filter((f) => dstFiles.includes(f))
		// copy srcOnly to dst
		await Promise.all(
			srcOnly.map((f) => {
				this.emit("missingFile", f)
				return this.copy(f, false).catch((e) => {
					this.emit("error", e)
				})
			})
		)
		// check duplicates
		for (const file of duplicates) {
			const [srcHash, dstHash] = await Promise.all([
				this.getHash(path.join(this.options.srcFolder, file)),
				this.getHash(path.join(this.options.dstFolder, file)),
			])
			if (srcHash !== dstHash) {
				this.emit("update", file)
				// backup dst
				await this.copy(file).catch((e) => {
					this.emit("error", e)
				})
			}
		}
	}
}

/**
 * @deprecated
 */
export const createMonitor = async (options: Options) => {
	const monit = new Monitor(options)
	await new Promise<void>((resolve) => {
		monit.once("ready", () => {
			resolve()
		})
	})
	return monit
}
export { Monitor }
export default Monitor
