"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const watch_1 = __importDefault(require("./watch"));
const options = {
    dstFolder: "/usr/local/fastpanel2/templates/virtualhost/configuration/",
    srcFolder: "/root/FastPanelFix/configs",
    bakFolder: "/root/FastPanelFix/bak",
};
const monit = new watch_1.default(options);
monit.on("ready", () => {
    console.log("ready");
});
monit.on("missingFile", (file) => {
    console.log("missingFile", file);
});
monit.on("update", (file) => {
    console.log("update", file);
});
monit.on("error", (e) => {
    console.log("error", e);
});
