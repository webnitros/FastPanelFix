import Monitor, {Options} from "./watch"

const options: Options = {
	dstFolder: "/usr/local/fastpanel2/templates/virtualhost/configuration/",
	srcFolder: "/root/FastPanelFix/configs",
	bakFolder: "/root/FastPanelFix/bak",
}
const monit            = new Monitor(options)
monit.on("ready", () => {
	console.log("ready")
})
monit.on("missingFile", (file) => {
	console.log("missingFile", file)
})
monit.on("update", (file) => {
	console.log("update", file)
})
monit.on("error", (e) => {
	console.log("error", e)
})