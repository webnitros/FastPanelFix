# FastPanelFix

Принцип работы:

Скрипт устанавливает наблюдатель за папкой '/usr/local/fastpanel2/templates/virtualhost/configuration/' (`dstFolder`) при каждом изменении файлов в ней файлы сравниваются с одноименными в папке '.
/configs' (`srcFolder`) и если они отличаются то новый файлы копируется в './bak' (`bakFolder`) а изменение отменяется

Требования:
1) root права
2) node v16+

Установка:

1) скачайте репозиторий куда-нибудь на сервер например в "/root/FastPanelFix/"
2) поменяйте, если нужно, логику работы в `index.ts` (не забудьте скомпилировать typescript `tsc ./index.ts`) 
3) посмотрите файл `FastPanelFix.service` и скопируйте в рабочую папку обычно `/lib/systemd/system/`
4) запустите сервис `sudo systemctl start FastPanelFix`
5) Отлично теперь у вас будет именно тот конфиг который вы положите в папку `./configs`


```bash
touch /etc/systemd/system/FastPanelFix.service
chmod 664 /etc/systemd/system/FastPanelFix.service
nano /etc/systemd/system/FastPanelFix.service
```

```bash
[Unit]
  Description=FastPanelFix
 
[Service]
  ExecStart=/usr/bin/node /root/FastPanelFix/index.js
  Type=idle
  KillMode=process
 
  SyslogIdentifier=FastPanelFix
  SyslogFacility=daemon
 
  Restart=on-failure
 
[Install]
  WantedBy=multiuser.target
```

```bash
systemctl start FastPanelFix
systemctl stop FastPanelFix
systemctl status FastPanelFix
systemctl enable FastPanelFix
```
