{{ if .VirtualHost.Settings -}}
{{- if .VirtualHost.Settings.ReqLimit -}}
limit_req_zone $binary_remote_addr zone={{ .VirtualHost.Domain }}:{{.VirtualHost.Settings.ZoneSize }}k rate={{ .VirtualHost.Settings.ReqLimitValue }}r/{{ .VirtualHost.Settings.RateString  }};
{{- end -}}
{{- end }}
server {
{{- if ne .VirtualHost.MainDomain.String "" }}
    server_name {{ .VirtualHost.MainDomain.String }};
{{- else }}
    server_name {{ .VirtualHost.Domain }} {{ .VirtualHost.JoinAliases " " }} {{ if .VirtualHost.Autosubdomains -}} *.{{ .VirtualHost.Domain }}{{ end -}};
{{- end }}

{{- if not .VirtualHost.HttpsRedirect }}
{{- range .VirtualHost.Ips }}
{{- if .IsV6 }}
    listen [{{ .Value }}]:80;
{{- else }}
    listen {{ .Value }}:80;
{{- end }}
{{- end }}
{{- end }}

{{- if .VirtualHost.Certificate }}
{{- if ne .VirtualHost.Certificate.Type "request" }}
{{- range .VirtualHost.Ips }}
{{- if .IsV6 }}
    listen [{{ .Value }}]:443 ssl {{ if $.VirtualHost.Http2 }} http2 {{ end }};
{{- else }}
    listen {{ .Value }}:443 ssl {{ if $.VirtualHost.Http2 }} http2 {{ end }};
{{- end -}}
{{- end }}

    ssl_certificate "/var/www/httpd-cert/{{ .VirtualHost.Certificate.Name }}.crt";
    ssl_certificate_key "/var/www/httpd-cert/{{ .VirtualHost.Certificate.Name }}.key";
{{- if .VirtualHost.Hsts }}
    add_header Strict-Transport-Security "max-age=31536000" always;
{{- end }}
{{- end }}
{{- end }}

    charset {{ .VirtualHost.Charset | ToLower }};
{{ if .VirtualHost.HttpAuth }}
    auth_basic "closed site";
    auth_basic_user_file {{ .VirtualHost.IndexDir }}/.httpauth;
{{- end }}

{{- if .VirtualHost.Gzip }}
    gzip on;
    gzip_proxied expired no-cache no-store private auth;
    gzip_types text/css text/xml application/javascript text/plain application/json image/svg+xml image/x-icon;
{{- if ne .VirtualHost.GzipCompLevel 0 }}
    gzip_comp_level {{  .VirtualHost.GzipCompLevel }};
{{ end -}}
{{ end -}}

{{ if .VirtualHost.Autosubdomains }}
    set $subdomain "";
    if ($host ~* ^([a-z0-9-\.]+)\.{{ .VirtualHost.Domain }}) {
        set $subdomain $1;
    }
    if ($host ~* ^www.{{ .VirtualHost.Domain }}) {
        set $subdomain "";
    }
    {{ if ne .VirtualHost.SubDirectory  "" }}
    set $root_path {{ .VirtualHost.IndexDir }}/{{ .VirtualHost.SubDirectory }}/$subdomain;
    {{ else }}
    set $root_path {{ .VirtualHost.IndexDir }}/$subdomain;
    {{ end }}
{{ else -}}
{{ if ne .VirtualHost.SubDirectory "" -}}
    set $root_path {{ .VirtualHost.IndexDir }}/{{ .VirtualHost.SubDirectory }};
{{ else }}
    set $root_path {{ .VirtualHost.IndexDir }};
{{- end -}}
{{- end }}
    root $root_path;
    disable_symlinks if_not_owner from=$root_path;

    include "/etc/nginx/includes/global-settings";

    location ~* ^/core/ {
        deny			all;
    }

    location / {
        location ~* ^/(manager|core|connectors)/ {
            include /etc/nginx/includes/admin-ips;
            deny            all;
                location ~* \.php$ {
                fastcgi_pass unix:/var/run/{{ .VirtualHost.Domain }}.sock;
                fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
                include /etc/nginx/fastcgi_params;
            }
        }

        {{- if .VirtualHost.Settings }}
        {{- if .VirtualHost.Settings.ReqLimit }}
        limit_req zone={{ .VirtualHost.Domain }} {{ if .VirtualHost.Settings.BurstFlag -}}burst={{ .VirtualHost.Settings.Burst }} {{ if .VirtualHost.Settings.NoDelay -}}nodelay{{ end -}}{{ end }};
        {{- end }}
        {{- end }}
        index {{ .VirtualHost.IndexPage }};

        # Безопастно разрешаем Яндекс вебвизор
        set $frame_options 'DENY';
        if ($http_referer !~ '^https?:\/\/([^\/]+\.)?({{ .VirtualHost.Domain }}|webvisor\.com|metri[ck]a\.yandex\.(com|ru|by|com\.tr))\/'){
        set $frame_options 'SAMEORIGIN';
        }
        add_header X-Frame-Options $frame_options;

        # точка входа в приложение
        try_files $uri $uri/ @core;
    }

    include "{{ .VirtualHost.IndexDir }}/../../nginx/*.conf";

    location @core {
        rewrite ^/(.*)$ /index.php?q=$1&$args last;
    }

    location /rest/ {
        try_files $uri @modx_rest;
    }
    location @modx_rest {
        rewrite ^/rest/(.*)$ /rest/index.php?_rest=$1&$args last;
    }

    location ~ \.php$ {
        try_files $uri =404;
{{- if .VirtualHost.Settings }}
{{- if .VirtualHost.Settings.ReqLimit }}
        limit_req zone={{ .VirtualHost.Domain }} {{ if .VirtualHost.Settings.BurstFlag -}}burst={{ .VirtualHost.Settings.Burst }} {{ if .VirtualHost.Settings.NoDelay -}}nodelay{{ end -}}{{ end }};
{{- end }}
{{- end }}
        include /etc/nginx/fastcgi_params;
        fastcgi_pass unix:/var/run/{{ .VirtualHost.Domain }}.sock;
        fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name;
        fastcgi_param DOCUMENT_ROOT $realpath_root;
     }

{{ if .VirtualHost.StaticFileHandler }}
{{- if eq .VirtualHost.StaticExtension "" }}
    location ~* ^.+\.(jpg|jpeg|gif|png|svg|js|css|mp3|ogg|mpe?g|avi|zip|gz|bz2?|rar|swf|ico|7z|doc|docx|map|ogg|otf|pdf|tff|tif|txt|wav|webp|woff|woff2|xls|xlsx|xml)$ {
{{- else }}
    location ~* ^.+\.({{ .VirtualHost.StaticExtensionNginxFormat }})$ {
{{- end }}
        # правильная обработка файлов при ошибке 404
        try_files $uri $uri/ @core;
{{- if ne .VirtualHost.Expired 0 }}
        expires {{ .VirtualHost.Expired }}d;
{{- end }}
    }
{{- end }}

    location @fallback {
        fastcgi_pass unix:/var/run/{{ .VirtualHost.Domain }}.sock;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        include /etc/nginx/fastcgi_params;
    }

    include "/etc/nginx/fastpanel2-sites/{{ .VirtualHost.Owner.Username }}/{{ .VirtualHost.Domain }}.includes";
    include /etc/nginx/fastpanel2-includes/*.conf;

{{ if .VirtualHost.LogsSettings.ErrorLog }}
    error_log {{ .VirtualHost.Owner.HomeDir }}/logs/{{ .VirtualHost.Domain }}-frontend.error.log;
{{- else }}
    error_log /dev/null crit;
{{- end }}
{{- if .VirtualHost.LogsSettings.AccessLog }}
    access_log {{ .VirtualHost.Owner.HomeDir }}/logs/{{ .VirtualHost.Domain }}-frontend.access.log;
{{- else }}
    access_log off;
{{- end }}
}

{{ if .VirtualHost.HttpsRedirect }}
server {
{{- if ne .VirtualHost.MainDomain.String "" }}
     server_name {{ .VirtualHost.MainDomain.String }};
{{ else }}
    server_name {{ .VirtualHost.Domain }} {{ .VirtualHost.JoinAliases " " }} {{ if .VirtualHost.Autosubdomains -}} *.{{ .VirtualHost.Domain }}{{ end -}};
{{- end }}
{{- range .VirtualHost.Ips -}}
{{ if .IsV6 }}
    listen [{{ .Value }}]:80;
{{ else }}
    listen {{ .Value }}:80;
{{- end }}
{{- end }}
    return 301 https://$host$request_uri;
{{ if .VirtualHost.LogsSettings.ErrorLog }}
    error_log {{ .VirtualHost.Owner.HomeDir }}/logs/{{ .VirtualHost.Domain }}-frontend.error.log;
{{- else }}
    error_log /dev/null crit;
{{- end }}
{{- if .VirtualHost.LogsSettings.AccessLog }}
    access_log {{ .VirtualHost.Owner.HomeDir }}/logs/{{ .VirtualHost.Domain }}-frontend.access.log;
{{- else }}
    access_log off;
{{- end }}
}
{{ end -}}

{{ if ne .VirtualHost.MainDomain.String "" }}
{{ if .VirtualHost.Aliases }}
server {
    server_name {{ .VirtualHost.JoinRedirectServerNames " " }} {{ if .VirtualHost.Autosubdomains -}} *.{{ .VirtualHost.Domain }}{{ end -}};
{{- range .VirtualHost.Ips -}}
{{ if .IsV6 }}
    listen [{{ .Value }}]:80;
{{ else }}
    listen {{ .Value }}:80;
{{- end -}}
{{- end }}
{{- if .VirtualHost.Certificate }}
{{- if .VirtualHost.Certificate.Enabled }}
{{- if ne .VirtualHost.Certificate.Type "request" }}
{{- range .VirtualHost.Ips -}}
{{- if .IsV6 }}
    listen [{{ .Value }}]:443 ssl {{ if $.VirtualHost.Http2 -}} http2 {{ end -}};
{{- else }}
    listen {{ .Value }}:443 ssl {{ if $.VirtualHost.Http2 -}} http2 {{ end -}};
{{- end }}
{{ end }}
    ssl_certificate "/var/www/httpd-cert/{{ .VirtualHost.Certificate.Name }}.crt";
    ssl_certificate_key "/var/www/httpd-cert/{{ .VirtualHost.Certificate.Name }}.key";
{{ if .VirtualHost.Hsts }}
    add_header Strict-Transport-Security "max-age=31536000" always;
{{- end -}}
{{- end -}}
{{- end -}}
{{- end }}
    return 301 $scheme://{{ .VirtualHost.MainDomain.String }}$request_uri;
{{ if .VirtualHost.LogsSettings.ErrorLog }}
    error_log {{ .VirtualHost.Owner.HomeDir }}/logs/{{ .VirtualHost.Domain }}-frontend.error.log;
{{- else }}
    error_log /dev/null crit;
{{- end }}
{{- if .VirtualHost.LogsSettings.AccessLog }}
    access_log {{ .VirtualHost.Owner.HomeDir }}/logs/{{ .VirtualHost.Domain }}-frontend.access.log;
{{- else }}
    access_log off;
{{- end }}
}
{{ end -}}
{{ end -}}
