# Banco de Talentos - versão 2 para GitHub Pages

Estrutura da versão 1 preservada, agora com:

- visual mantido
- verde alterado para um verde escuro
- suporte a salvamento em nuvem com Firebase Firestore
- fallback local para não quebrar o site caso o Firebase ainda não esteja configurado

## Arquivos principais

- `index.html`
- `candidato.html`
- `empresa.html`
- `consultora.html`
- `admin.html`
- `styles.css`
- `app.js`
- `firebase-config.js`

## O que a versão 2 faz

### Mantido da versão 1
- Página inicial institucional
- Área do Candidato
- Área da Empresa
- Área da Consultora
- Área Administrativa
- Navegação e layout preservados

### Novo na versão 2
- Salvamento em nuvem de:
  - candidatos
  - vagas
  - pareceres
- Leitura em tempo real do Firestore
- Indicador visual de modo:
  - `Modo nuvem` quando o Firebase estiver configurado
  - `Modo local` enquanto você ainda não preencher o arquivo de configuração

## Como ligar no Firebase

### 1) Crie um projeto no Firebase
No console do Firebase:
- crie um projeto
- ative o **Firestore Database**
- escolha o modo de produção ou teste
- registre um app Web

### 2) Pegue as credenciais do app
No Firebase, copie:
- apiKey
- authDomain
- projectId
- storageBucket
- messagingSenderId
- appId

### 3) Preencha o arquivo `firebase-config.js`
Substitua os campos:

```js
window.BT_FIREBASE_CONFIG = {
  apiKey: "COLE_AQUI_SUA_API_KEY",
  authDomain: "COLE_AQUI_SEU_AUTH_DOMAIN",
  projectId: "COLE_AQUI_SEU_PROJECT_ID",
  storageBucket: "COLE_AQUI_SEU_STORAGE_BUCKET",
  messagingSenderId: "COLE_AQUI_SEU_MESSAGING_SENDER_ID",
  appId: "COLE_AQUI_SEU_APP_ID"
};
```

### 4) Firestore
Crie ou deixe o Firestore pronto para estas coleções:
- `candidates`
- `jobs`
- `feedbacks`

O site cria os documentos automaticamente quando você salvar os formulários.

## Publicar no GitHub Pages

1. Crie ou abra o repositório no GitHub
2. Envie todos os arquivos da pasta para a raiz do repositório
3. Vá em **Settings > Pages**
4. Em **Source**, escolha a branch principal e a pasta raiz
5. Salve
6. Aguarde o link do GitHub Pages

## Observação importante

Esta versão 2 já está preparada para nuvem, mas ainda não inclui:
- login com senha real
- upload real de arquivo PDF para currículo
- painel de permissões por usuário
- pagamentos
- área privada protegida por autenticação

Essas partes podem ser feitas na próxima etapa sem refazer o layout.


## Firebase já conectado

Esta versão já está apontando para o projeto `bancotalentoserika` no Firebase/Firestore.

Antes de publicar, ajuste as regras temporárias do Firestore para teste, se necessário:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

Depois, no ambiente final, o ideal é restringir essas regras por autenticação e perfil.
