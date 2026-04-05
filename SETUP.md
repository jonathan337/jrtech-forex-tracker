# Setup Guide

## Quick Start

Follow these steps to get your Foreign Currency Payment Tracker up and running:

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Environment Variables

Create a `.env` file in the root directory.

**Database (Supabase + Prisma)** — in the [Supabase dashboard](https://supabase.com/dashboard) open **Project Settings → Database**. Copy:

- **Transaction pooler** (URI, port `6543`) → use as `DATABASE_URL` (add `?pgbouncer=true` if not already in the string; Prisma needs this for the pooler).
- **Direct connection** (URI, port `5432`) → use as `DIRECT_URL` for migrations.

For local development you can point **both** `DATABASE_URL` and `DIRECT_URL` at the **same direct** `postgresql://...5432/...` connection string.

```bash
# Supabase PostgreSQL (see above)
DATABASE_URL="postgresql://..."
DIRECT_URL="postgresql://..."

# Auth.js / NextAuth (generate secret with: openssl rand -base64 32)
AUTH_SECRET="your-generated-secret-here"

# Public URL of the app (use http://localhost:3004 for local dev)
AUTH_URL="http://localhost:3004"

# Brevo Email Service (for email verification)
BREVO_API_KEY="your-brevo-api-key-here"
BREVO_FROM_EMAIL="noreply@yourdomain.com"
BREVO_FROM_NAME="FX Payment Tracker"
```

**Important:** 
1. Generate a secure AUTH_SECRET by running:
   ```bash
   openssl rand -base64 32
   ```

2. Set up Brevo for email verification:
   - Sign up at [Brevo](https://www.brevo.com/) (formerly Sendinblue)
   - Create an API key in your Brevo dashboard
   - Add the API key to your `.env` file
   - Configure your sender email (must be verified in Brevo)

### 3. Initialize the Database

With `DATABASE_URL` and `DIRECT_URL` set to your Supabase Postgres instance, apply migrations:

```bash
npx prisma migrate deploy
```

For active development (creates/updates migration files when you change the schema):

```bash
npx prisma migrate dev
```

This applies migrations and generates the Prisma Client (`npx prisma generate` also runs via `npm` `postinstall`).

### 4. Start the Development Server

```bash
npm run dev
```

Open [http://localhost:3004](http://localhost:3004) to see your application.

### 5. Create Your First Account

1. Navigate to http://localhost:3004/register
2. Enter your business name, email, and password
3. Check your email for a verification link
4. Click the verification link to activate your account
5. Sign in with your credentials to access the dashboard

## Features Overview

### Authentication & Multi-Tenancy
- ✅ User registration and login
- ✅ Email verification with Brevo integration
- ✅ Each business has isolated data
- ✅ Secure password hashing with bcrypt
- ✅ JWT-based session management

### People Management
- Add currency providers (customers, clients, friends)
- Store contact information and notes
- Track how many cards each person provides

### Card Management
- Link credit cards to people
- Track card nicknames and last 4 digits
- Add notes about each card

### Monthly Availability
- Record available USD amounts by month
- Track exchange rates for each transaction
- Set payment due dates
- Record fees and special notes
- View historical data month by month

### Dashboard Features
- **Live Exchange Rates**: Integrated with Republic Bank Trinidad's forex rates
- **Monthly Summary**: Total USD, TTD value, average rates
- **Visual Cards**: Color-coded metrics with icons
- **Detailed Table**: All monthly availability entries

### Exchange Rate Integration
The dashboard displays live USD exchange rates from [Republic Bank Trinidad](https://republictt.com/personal/forex-rates):
- Buying rate (TTD per USD)
- Selling rate (TTD per USD)
- Last updated timestamp
- Refresh button for latest rates

## Database Management

### View Database in Prisma Studio

```bash
npx prisma studio
```

This opens a visual database browser at http://localhost:5555

### Reset Database

```bash
npx prisma migrate reset
```

**Warning:** This will delete all data!

### Create New Migration

After changing the Prisma schema:

```bash
npx prisma migrate dev --name your_migration_name
```

## Troubleshooting

### TypeScript Errors After Migration

If you see TypeScript errors about missing types after running migrations:

1. Regenerate Prisma Client:
   ```bash
   npx prisma generate
   ```

2. Restart your development server:
   ```bash
   # Stop the server (Ctrl+C) and restart
   npm run dev
   ```

3. If using VS Code, reload the window:
   - Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
   - Type "Reload Window" and press Enter

### Authentication Issues

If you can't log in:

1. Check that `AUTH_SECRET` is set in `.env`
2. Verify the database has the User table (run `npx prisma studio`)
3. Try registering a new account

### Exchange Rate Not Loading

The exchange rate feature attempts to scrape data from Republic Bank's website. If it fails:
- The app will show fallback rates (6.80 selling, 6.75 buying)
- Check your internet connection
- The bank's website structure may have changed

## Production Deployment

### Environment Variables for Production

Set these environment variables in your hosting platform (e.g. Netlify):

```
DATABASE_URL="postgresql://...pooler...6543...?pgbouncer=true"
DIRECT_URL="postgresql://...direct...5432..."
AUTH_SECRET="your-secure-secret"
AUTH_URL="https://your-site.netlify.app"
```

Use the **Transaction pooler** URI for `DATABASE_URL` and the **Direct** URI for `DIRECT_URL` on Supabase. Run `npx prisma migrate deploy` against the direct URL whenever you ship new migrations (locally or in CI).

### Database

The app uses **PostgreSQL on Supabase** with Prisma. Schema and migrations live under `prisma/`.

### Build for Production

```bash
npm run build
npm start
```

## Tech Stack

- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript
- **Database**: PostgreSQL (Supabase) via Prisma
- **ORM**: Prisma
- **Authentication**: NextAuth.js v5
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **Validation**: Zod
- **Date Handling**: date-fns

## Project Structure

```
├── app/
│   ├── api/              # API routes
│   │   ├── auth/         # NextAuth endpoints
│   │   ├── people/       # People CRUD
│   │   ├── cards/        # Cards CRUD
│   │   ├── availability/ # Availability CRUD
│   │   ├── summary/      # Monthly summary
│   │   └── exchange-rate/# Live forex rates
│   ├── login/            # Login page
│   ├── register/         # Registration page
│   ├── people/           # People management
│   ├── cards/            # Cards management
│   ├── availability/     # Availability management
│   └── page.tsx          # Dashboard
├── components/
│   ├── ui/               # Reusable UI components
│   └── Navigation.tsx    # Main navigation
├── lib/
│   ├── auth.ts           # NextAuth configuration
│   └── prisma.ts         # Prisma client
├── prisma/
│   ├── schema.prisma     # Database schema
│   └── migrations/       # Migration history
└── types/
    └── next-auth.d.ts    # TypeScript definitions
```

## Support

For issues or questions:
1. Check this SETUP.md file
2. Review the main README.md
3. Check Prisma documentation: https://www.prisma.io/docs
4. Check NextAuth.js documentation: https://next-auth.js.org/

## License

MIT

