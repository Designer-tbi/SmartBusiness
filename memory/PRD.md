# SmartBusiness - PRD & Architecture

## Problem Statement
L'utilisateur ne parvient pas à se connecter/déployer son application sur Vercel. L'application est une plateforme CRM/Call Center (SmartBusiness) construite avec Express.js + Vite + React + TypeScript.

## Architecture
- **Frontend**: React 19 + Vite + Tailwind CSS + TypeScript
- **Backend**: Express.js (Node.js) - monolithique
- **Database**: PostgreSQL (Neon) avec fallback SQLite pour le dev local
- **Auth**: JWT avec cookies httpOnly
- **Deployment Target**: Vercel (serverless)

## Core Requirements
- Application CRM complète (clients, leads, opportunités, devis, factures)
- Portefeuille de contacts par catégories
- Gestion d'appels et d'activités
- Tableau de bord avec statistiques
- Gestion des produits et catalogues
- Système de commissions
- Objectifs commerciaux

## What's Been Implemented (Jan 2026)
### Adaptation Vercel Serverless
1. **server.ts modifié** :
   - `app.listen()` conditionnel (skip sur Vercel)
   - Import dynamique de Vite (évite erreur build Vercel)
   - Vite middleware + static serving conditionnels (skip sur Vercel)
   - Export du handler Express pour Vercel serverless
   - Fix bug `isPlaceholderUrl` (détection faux positif URLs contenant 'base')
   - `return app` ajouté pour exporter l'instance Express

2. **api/index.ts créé** : Point d'entrée serverless Vercel

3. **vercel.json mis à jour** : Configuration routing API + SPA

## Configuration Requise sur Vercel
L'utilisateur doit configurer ces variables d'environnement dans Vercel Dashboard:
- `DATABASE_URL` : URL PostgreSQL (Neon recommandé)
- `JWT_SECRET` : Clé secrète pour les tokens JWT
- `VERCEL` : Automatiquement défini par Vercel (= "1")
- `NODE_ENV` : Automatiquement "production" sur Vercel
- `GEMINI_API_KEY` (optionnel) : Pour les fonctionnalités IA

## Backlog
- P0: Tester le déploiement complet sur Vercel
- P1: Remplacer multer (uploads fichiers) par une solution cloud (Vercel Blob / Cloudinary)
- P1: Ajouter CORS configuration si nécessaire
- P2: Optimiser le cold start serverless (code splitting, lazy loading des seeds)
- P2: Migration SQLite → PostgreSQL uniquement (supprimer le code SQLite)
