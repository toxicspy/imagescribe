# Overview

ScreenText Editor is an OCR-based screenshot text replacement application built with React, Express, and TypeScript. The application allows users to upload images, automatically detect text using Tesseract.js OCR technology, and replace or edit the detected text directly within the image. The system operates entirely client-side for OCR processing, eliminating the need for external APIs while providing a professional text editing experience for screenshots and images.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **Framework**: React 18 with TypeScript using Vite as the build tool
- **UI Components**: Radix UI primitives with shadcn/ui component library for consistent design
- **Styling**: Tailwind CSS with CSS variables for theming support (light/dark modes)
- **State Management**: TanStack Query (React Query) for server state management
- **Routing**: Wouter for lightweight client-side routing
- **OCR Processing**: Tesseract.js for client-side text recognition, loaded via CDN

## Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript with ES modules
- **Development**: tsx for TypeScript execution in development
- **Build**: esbuild for production bundling
- **Storage Interface**: Abstracted storage layer with in-memory implementation for user management

## Data Layer
- **Database**: PostgreSQL configured via Drizzle ORM
- **Schema Management**: Drizzle Kit for migrations and schema definition
- **Connection**: Neon Database serverless driver for PostgreSQL connectivity
- **Validation**: Zod schemas integrated with Drizzle for type-safe data validation

## Development Tools
- **Bundler**: Vite with React plugin for fast development and hot module replacement
- **Replit Integration**: Cartographer plugin for Replit-specific development features
- **Error Handling**: Runtime error overlay for development debugging
- **Session Management**: PostgreSQL session store (connect-pg-simple) for user sessions

## File Structure
- `/client` - React frontend application
- `/server` - Express backend API
- `/shared` - Shared TypeScript types and schemas
- `/migrations` - Database migration files

The architecture emphasizes client-side OCR processing to avoid external API dependencies while maintaining a clean separation between frontend and backend concerns.

# External Dependencies

## Core Framework Dependencies
- **@neondatabase/serverless** - Serverless PostgreSQL driver for database connectivity
- **drizzle-orm** and **drizzle-kit** - Type-safe ORM and migration tools
- **express** - Web application framework for the backend API
- **react** and **@vitejs/plugin-react** - Frontend framework and build tooling

## UI and Component Libraries
- **@radix-ui/react-*** - Comprehensive set of unstyled, accessible UI primitives
- **@tanstack/react-query** - Server state management and data synchronization
- **tailwindcss** - Utility-first CSS framework for styling
- **wouter** - Minimalist routing library for React

## OCR and Processing
- **tesseract.js** - Pure JavaScript OCR library loaded via CDN script tag
- **date-fns** - Date utility library for timestamp handling

## Development and Build Tools
- **vite** - Build tool and development server
- **typescript** and **tsx** - TypeScript runtime and compilation
- **esbuild** - Fast JavaScript bundler for production builds

## Validation and Utilities
- **zod** - TypeScript-first schema validation
- **clsx** and **tailwind-merge** - Utility functions for conditional CSS classes
- **nanoid** - URL-safe unique string ID generator

## Session and State Management
- **connect-pg-simple** - PostgreSQL session store for Express sessions

The application is designed to minimize external API dependencies by performing OCR processing entirely on the client side using Tesseract.js, while maintaining a robust backend for user management and data persistence.