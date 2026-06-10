# Instalação offline

Esta pasta contém tudo o que o projeto precisa para ser construído e
executado numa máquina **sem acesso à internet**:

| Conteúdo            | Descrição                                                        |
|---------------------|------------------------------------------------------------------|
| `deps/`             | Store do pnpm com todas as dependências do `pnpm-lock.yaml` (tar dividido em partes de 90MB) |
| `images/`           | Imagens Docker base (`node:22-alpine`, `nginx:alpine`)           |
| `bin/`              | Tarball do pnpm 9.15.9 (instalado dentro do container no build)  |

## Como usar (máquina sem internet)

```bash
git clone <este repositório>   # ou copie via pendrive/rede interna
cd rahoot
./offline/preparar.sh          # extrai a store e carrega as imagens Docker
docker compose build           # build 100% local
docker compose up -d
```

O `Dockerfile` detecta automaticamente a store extraída (`.pnpm-store/`)
e o tarball do pnpm (`offline/bin/`) e instala tudo sem rede. Se a store
não estiver extraída, o build volta a usar a internet normalmente.

## Como atualizar os pacotes (máquina com internet)

Sempre que o `pnpm-lock.yaml` mudar, regenere os pacotes e commite:

```bash
./offline/empacotar.sh
git add offline/
git commit -m "chore: atualiza pacotes offline"
```

## Observações

- Os arquivos são divididos em partes de 90MB porque o GitHub recusa
  arquivos maiores que 100MB.
- A pasta `.pnpm-store/` extraída fica fora do git (`.gitignore`) e fora
  das partes pesadas do contexto Docker — apenas as partes em `offline/`
  são versionadas.
- Os avatares 3D (`config/avatars-3d`, ~590MB) são dados de runtime e não
  ficam no repositório: copie a pasta `config/` junto com o projeto ao
  levar para outra máquina.
