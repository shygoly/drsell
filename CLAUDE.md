# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **multi-service AI chatbot platform** for Shopify stores, integrating with the Coze AI platform. The architecture consists of:

- **chatbot** - Shopify Remix app (React frontend + Remix server)
- **chatbotapi** - Java Spring Boot API service (中间层)
- **chatbotadmin** - Java Spring Boot backend (Yudao framework)
- **chatbot-node** - Node.js/Express service (可选/测试)
- **coze-js-examples** - Coze SDK monorepo with examples
- **coze-proxy-worker** - Cloudflare Workers proxy

## Architecture

### Service Communication Flow

```
Shopify Store → Remix App (chatbot) → Java API (chatbotapi) → Java Backend (chatbotadmin)
                                                            ↓
                                                    Coze AI Platform
```

The chatbotapi service handles API requests from the Remix frontend, managing authentication, bot settings, and Coze OAuth integration before routing to the main backend.

### Key Integration Points

1. **Authentication**: JWT tokens stored in Redis, Shopify OAuth, Coze OAuth
2. **Database**: Prisma ORM (Node services) + MyBatis Plus (Java backend)
3. **Real-time**: SSE streaming for chat responses, Socket.io support
4. **Webhooks**: Shopify event handling, Coze callbacks

## Common Commands

### Shopify Remix App (chatbot/)

```bash
cd chatbot
npm run dev          # Start dev server with Shopify CLI
npm run build        # Build for production
npm run lint         # Run ESLint
npm test             # Run Jest tests
npm run deploy       # Deploy to Shopify
```

### Java API Service (chatbotapi/)

```bash
cd chatbotapi
mvn clean install                    # Build project
mvn spring-boot:run                  # Run API service
mvn test                             # Run tests
mvn clean package -DskipTests        # Build without tests
```

### Java Spring Boot Backend (chatbotadmin/)

```bash
cd chatbotadmin
mvn clean install                    # Build entire project
mvn spring-boot:run -pl yudao-server # Run main app (port 48080)
mvn test                             # Run tests
mvn clean package -DskipTests        # Build without tests
```

### Node.js Service (chatbot-node/) - Optional

```bash
cd chatbot-node
npm run dev          # Start with hot reload (tsx watch, port 3000)
npm run build        # Compile TypeScript to dist/
npm start            # Run production build
npm run lint         # Run ESLint
npm test             # Run tests
```

## Development Workflow

### Setting Up Local Environment

1. **Node.js services** require Node 18+
2. **Java backend** requires Java 8+ and Maven
3. **Database**: SQLite for local development (auto-created by Prisma)
4. **Environment files**: Each service has `.env.example` - copy to `.env` and configure

### Running the Full Stack Locally

1. Start Java backend: `cd chatbotadmin && mvn spring-boot:run -pl yudao-server`
2. Start Java API service: `cd chatbotapi && mvn spring-boot:run`
3. Start Remix app: `cd chatbot && npm run dev`

### Database Migrations

- **Node services**: Prisma migrations in `prisma/migrations/`
  - `npx prisma migrate dev --name <migration_name>` - Create and apply migration
  - `npx prisma db push` - Sync schema to database
- **Java backend**: Yudao uses SQL scripts in `yudao-server/src/main/resources/db/`

## Code Organization

### chatbot (Remix)

- `app/routes/` - Page routes and API endpoints
- `app/models/` - Data models and types
- `app/controllers/` - Request handlers
- `prisma/schema.prisma` - Database schema

### chatbotapi (Java API Service)

- `src/main/java/com/chada/chatbot/chatapi/controller/` - API endpoints (BotSetting, InboxUser, OAuth)
- `src/main/java/com/chada/chatbot/chatapi/service/` - Business logic
- `src/main/java/com/chada/chatbot/chatapi/oauth/` - Coze OAuth integration
- `src/main/java/com/chada/chatbot/chatapi/entity/` - Data models
- `src/main/java/com/chada/chatbot/chatapi/repository/` - Data access layer

### chatbotadmin (Java Backend)

- `yudao-server/` - Main Spring Boot application
- `yudao-module-*/` - Feature modules (system, infra, bpm, crm, mail)
- `yudao-module-mail/` - Contains Coze integration logic
- Uses Yudao code generator for CRUD operations

### chatbot-node (Node.js) - Optional

- `src/routes/` - Express route handlers
- `src/services/` - Business logic and external API calls
- `src/middleware/` - Authentication, logging, error handling
- `src/lib/` - Utilities (logger, backend client, validators)
- `src/types/` - TypeScript type definitions

## Key Technologies

- **Frontend**: React 18, Remix 2.15, TypeScript, Shopify Polaris
- **Backend**: Java 8+, Spring Boot 2.7.18, Spring Security, MyBatis Plus
- **Node Services**: Express 4.18, TypeScript 5.3, Prisma 6.18
- **Databases**: MySQL (production), SQLite (development)
- **Cache**: Redis for token storage
- **Workflow**: Flowable engine (Java backend)
- **External APIs**: Coze AI, Shopify Admin API, ChadaApi

## Testing

- **Node.js**: Jest for unit/integration tests
- **Java**: JUnit for unit tests
- **Coze SDK**: Vitest (see `.cursor/rules/coze-js-rule.mdc`)

Run tests with `npm test` (Node) or `mvn test` (Java).

## Deployment

- **Remix app**: Shopify CLI deployment
- **Node proxy**: Fly.io (configured in `fly.toml`)
- **Java backend**: Docker container or traditional server
- **Cloudflare Workers**: `coze-proxy-worker/` for edge proxying

## Important Notes

- **Service isolation**: Each service has its own database and configuration
- **API layer**: chatbotapi handles bot settings, inbox users, and Coze OAuth
- **Backend**: chatbotadmin provides core business logic and data management
- **Error handling**: Consistent error response format across services
- **Logging**: SLF4J (Java) - check logs for debugging
- **Security**: JWT validation on all protected endpoints, CORS configured per service
