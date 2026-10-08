# Implantação da Caderneta Escolar

Guia para colocar a Caderneta no ar para uma escola. Uma instalação = uma escola (uma unidade).

## 1. O que é preciso

- Um servidor Linux pequeno (1 vCPU e 1 GB de RAM atendem uma escola de até ~1.500 alunos) **ou** um
  computador da escola que fique ligado.
- **Node.js 22.16 ou mais novo** (o servidor usa só módulos nativos: `node:http`, `node:sqlite`,
  `node:crypto` — não há `npm install`).
- Um endereço (domínio) e **HTTPS**. O TLS fica num proxy reverso; recomendamos o
  [Caddy](https://caddyserver.com), que obtém e renova o certificado sozinho.

## 2. Variáveis de ambiente

| Variável | Padrão | Para quê |
| --- | --- | --- |
| `PUBLIC_URL` | — | Endereço público, só a origem (ex.: `https://caderneta.escola.com.br`). **Obrigatória** fora do próprio computador. Com `https://`, o cookie de sessão vira `__Host-` e seguro. Também é usada nos links de convite. |
| `HOST` | `127.0.0.1` | Interface de escuta. Atrás de proxy no mesmo servidor, deixe o padrão. |
| `PORT` | `3000` | Porta HTTP interna. |
| `DATA_DIR` | `./data` | Banco (`caderneta.db`), anexos (`files/`), backups (`backups/`) e o código de instalação. Permissão 700. |
| `TRUST_PROXY` | `0` | Quantos proxies confiáveis existem na frente (para ler o IP real em `X-Forwarded-For`). Com Caddy no mesmo servidor: `1`. |
| `SETUP_TOKEN` | gerado | Código da primeira instalação (se não definir, o servidor gera e mostra no terminal). |
| `ALLOW_INSECURE_HTTP` | — | `1` permite servir sem HTTPS fora do loopback. **Só para rede de testes.** |

## 3. Primeira execução

```bash
git clone <repositório> caderneta && cd caderneta/escola
PUBLIC_URL=https://caderneta.escola.com.br TRUST_PROXY=1 npm start
```

O terminal mostra o **código de instalação** (também salvo em `DATA_DIR/setup-token.txt`). Abra o
endereço, preencha o código, o nome da escola e os dados da **conta titular** (em geral a direção). O código
deixa de valer depois de usado. A partir daí:

1. **Configurações**: dados da escola, ano letivo, etapas (bimestre/trimestre), etapas de ensino
   (chamada diária ou por aula, frequência mínima, nota ou parecer), disciplinas, agenda e mensalidades.
2. **Turmas**: crie as turmas e o horário.
3. **Equipe e acessos**: crie as contas por cargo. O sistema pré-seleciona os acessos do cargo e você marca
   extras ou retira o que não quiser. Cada pessoa recebe um **código de primeiro acesso** (válido por 72 h)
   para criar a própria senha — envie por WhatsApp ou e-mail.
4. **Alunos**: matricule (ou importe da versão anterior em Configurações → Backup).
5. **Famílias**: na lista de alunos, "Convidar famílias da turma" gera os códigos de acesso ao Portal da família.

## 4. Caddy (HTTPS automático)

`/etc/caddy/Caddyfile`:

```
caderneta.escola.com.br {
	encode gzip
	reverse_proxy 127.0.0.1:3000
	request_body {
		max_size 90MB
	}
}
```

## 5. Serviço do sistema (systemd)

`/etc/systemd/system/caderneta.service`:

```ini
[Unit]
Description=Caderneta Escolar
After=network.target

[Service]
User=caderneta
WorkingDirectory=/opt/caderneta/escola
Environment=PUBLIC_URL=https://caderneta.escola.com.br
Environment=TRUST_PROXY=1
Environment=DATA_DIR=/var/lib/caderneta
ExecStart=/usr/bin/node --disable-warning=ExperimentalWarning server/index.js
Restart=on-failure
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/var/lib/caderneta
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

```bash
sudo useradd --system --home /var/lib/caderneta caderneta
sudo mkdir -p /var/lib/caderneta && sudo chown caderneta: /var/lib/caderneta && sudo chmod 700 /var/lib/caderneta
sudo systemctl enable --now caderneta
journalctl -u caderneta -f      # o código de instalação aparece aqui na primeira vez
```

## 6. Docker

```bash
docker build -t caderneta .
docker run -d --name caderneta -p 127.0.0.1:3000:3000 \
  -e PUBLIC_URL=https://caderneta.escola.com.br -v caderneta-dados:/data caderneta
docker logs caderneta            # código de instalação
```

## 7. Backups

- **Automático**: todo dia às 03h (fuso da escola) e a cada inicialização, em `DATA_DIR/backups/`
  (cópia consistente do banco com `sqlite.backup()` + anexos). Ficam as 14 cópias mais recentes.
  **Copie essa pasta para fora do servidor** (outro disco, nuvem) — backup no mesmo disco não protege de
  perda do servidor.
- **Manual e cifrado**: Configurações → Backup → Exportar (pede a sua senha e uma senha do backup com pelo
  menos 10 caracteres; o arquivo `.caderneta` é cifrado com AES-256-GCM). Guarde a senha do backup: sem ela
  o arquivo não abre.
- **Restaurar**: só a conta titular, em Configurações → Backup → Importar. Antes de importar, o servidor faz
  um backup automático. A importação troca os dados escolares, mas **mantém as contas e senhas atuais**.
  Também aceita o arquivo JSON da versão anterior (a que guardava os dados no navegador).
- Restaurar um backup automático com o servidor parado:
  `cp DATA_DIR/backups/<data>/caderneta.db DATA_DIR/caderneta.db` e os anexos para `DATA_DIR/files/`.

## 8. Senha da conta titular perdida

Com acesso ao servidor:

```bash
node --disable-warning=ExperimentalWarning server/index.js --reset-owner-password
```

Mostra um código (72 h, uso único). Na tela de entrada: "Tenho um código de acesso". As outras contas
recebem um novo código pela própria escola (Equipe e acessos → Gerar novo código). Contas com acesso a
atendimentos sigilosos (psicologia, psicopedagogia…) só recebem código de quem também tem esse acesso — ou do
servidor, pelo e-mail ou celular da pessoa:

```bash
node --disable-warning=ExperimentalWarning server/index.js --reset-password=psicologa@escola.com.br
```

## 9. Atualizar

```bash
cd /opt/caderneta && git pull && sudo systemctl restart caderneta
```

As migrações de dados rodam sozinhas na inicialização (um backup é feito antes, na partida).
Rode `npm test` antes de colocar uma versão nova no ar.

## 10. Demonstração

- `npm run demo`: servidor com a escola de exemplo **em memória** (nada é gravado), com "Entrar como…".
- `web/demo.html` aberto direto no navegador (ou publicado como página estática): a demonstração roda no
  navegador, com os dados guardados só nele. Nunca use a demonstração com dados reais.

## 11. Segurança — resumo

Senhas com scrypt; sessão em cookie `HttpOnly`/`SameSite=Lax` (`__Host-` com HTTPS), 60 min de
inatividade e 12 h no máximo para a equipe; limites de tentativas por conta e por IP; toda alteração exige o
cabeçalho `X-Caderneta` e origem compatível (sem CORS); política de conteúdo `default-src 'self'`; fontes
locais (sem chamadas a terceiros); anexos conferidos pelo conteúdo (PNG, JPEG, WEBP, PDF, até 10 MB) e
entregues com `sandbox`; registro de atividades (inclusive cada leitura de atendimento sigiloso);
uma instância por pasta de dados (lockfile). Detalhes de privacidade em [PRIVACIDADE.md](PRIVACIDADE.md).
