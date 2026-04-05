# Foreign Currency Payment Tracker

A multi-tenant Next.js application for tracking foreign currency payments and credit card availability for businesses in Trinidad.

## Overview

This application helps businesses manage access to foreign currency (USD) through personal credit cards. It tracks:

- **People**: Individuals who provide foreign currency (customers, clients, friends, etc.)
- **Cards**: Credit cards that provide access to foreign currency
- **Monthly Availability**: Track which cards are available each month, how much currency is available, exchange rates, payment dates, and fees

## Features

### 🔐 Authentication & Multi-Tenancy
- **User Registration & Login**: Secure authentication system
- **Business Isolation**: Each business has their own isolated data
- **Session Management**: JWT-based sessions with NextAuth.js

### 📊 Dashboard
- **Live Exchange Rates**: Integrated with [Republic Bank Trinidad's forex rates](https://republictt.com/personal/forex-rates)
  - Real-time USD buying and selling rates
  - Refresh button for latest rates
  - Direct link to source
- **Monthly Summary**: View total USD available, average exchange rates, and TTD values
- **Visual Metrics**: Color-coded cards showing key statistics
- **Month Navigation**: Browse historical data month by month

### 👥 People Management
- Add and manage currency providers with contact information
- Track emails, phone numbers, and notes
- View card count per person

### 💳 Card Management
- Link credit cards to people
- Track card nicknames and last 4 digits
- Add general notes about each card
- View monthly availability history

### 📅 Monthly Availability
- Record monthly availability for each card including:
  - Amount in USD
  - Exchange rate (TTD/USD)
  - Payment due date
  - Fees
  - Special notes
- Comprehensive table view with all details
- Edit and delete capabilities

### 🎨 Modern UI/UX
- Beautiful gradient backgrounds
- Hover effects and smooth transitions
- Responsive design for all screen sizes
- Clean, professional interface

## Tech Stack

- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript
- **Database**: SQLite (dev) / Prisma ORM
- **Authentication**: NextAuth.js v5 with JWT
- **Password Hashing**: bcryptjs
- **Styling**: Tailwind CSS with custom gradients
- **Validation**: Zod
- **Icons**: Lucide React
- **Date Handling**: date-fns
- **External Integration**: Republic Bank TT forex rates

## Getting Started

### Prerequisites

- Node.js 18+ installed
- npm or yarn package manager

### Quick Setup

See [SETUP.md](./SETUP.md) for detailed setup instructions.

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file:
```bash
DATABASE_URL="file:./dev.db"
AUTH_SECRET="your-secret-here"  # Generate with: openssl rand -base64 32
NEXTAUTH_URL="http://localhost:3004"
```

3. Set up the database:
```bash
npx prisma migrate dev
```

4. Run the development server:
```bash
npm run dev
```

5. Open [http://localhost:3004/register](http://localhost:3004/register) to create your first account

## Database Schema

### User
- Business/user account
- Fields: email, password (hashed), businessName
- Relationship: has many People

### Person
- Stores information about currency providers
- Fields: name, email, phone, notes
- Relationship: belongs to a User, has many Cards

### Card
- Represents credit cards that provide foreign currency access
- Fields: cardNickname, lastFourDigits, notes
- Relationship: belongs to a Person, has many MonthlyAvailability entries

### MonthlyAvailability
- Tracks monthly availability for each card
- Fields: year, month, amountUSD, exchangeRate, paymentDate, feeAmount, notes
- Relationship: belongs to a Card
- Unique constraint: one entry per card per month

## API Routes

All API routes (except `/api/auth/*` and `/api/register`) require authentication. Data is automatically filtered by the logged-in user.

### Authentication
- `POST /api/auth/signin` - Sign in (handled by NextAuth)
- `POST /api/auth/signout` - Sign out (handled by NextAuth)
- `POST /api/register` - Create new business account

### People
- `GET /api/people` - List all people for authenticated user
- `POST /api/people` - Create a new person
- `GET /api/people/[id]` - Get person details
- `PUT /api/people/[id]` - Update person
- `DELETE /api/people/[id]` - Delete person

### Cards
- `GET /api/cards` - List all cards for authenticated user
- `POST /api/cards` - Create a new card
- `GET /api/cards/[id]` - Get card details
- `PUT /api/cards/[id]` - Update card
- `DELETE /api/cards/[id]` - Delete card

### Availability
- `GET /api/availability` - List availability entries (supports ?year and ?month filters)
- `POST /api/availability` - Create a new availability entry
- `GET /api/availability/[id]` - Get availability details
- `PUT /api/availability/[id]` - Update availability
- `DELETE /api/availability/[id]` - Delete availability

### Summary
- `GET /api/summary?year=YYYY&month=M` - Get monthly summary with statistics

### Exchange Rate
- `GET /api/exchange-rate` - Get live USD exchange rates from Republic Bank TT

## Usage Flow

1. **Register**: Create your business account at `/register`
2. **Add People**: Start by adding the individuals who provide foreign currency
3. **Add Cards**: Create card entries for each person's credit card
4. **Add Monthly Availability**: For each month, add availability entries for cards that will be available
5. **View Dashboard**: Navigate to the dashboard to see monthly summaries, live exchange rates, and track total availability

## Multi-Tenant Architecture

Each business that registers gets their own isolated data:
- Users can only see their own people, cards, and availability entries
- All API routes are protected and filter data by authenticated user
- Secure password hashing with bcrypt
- JWT-based session management

## Development

### Database Management

```bash
# Create a new migration
npx prisma migrate dev --name migration_name

# Reset database
npx prisma migrate reset

# Open Prisma Studio (database GUI)
npx prisma studio
```

### Build for Production

```bash
npm run build
npm start
```

## Project Structure

```
├── app/
│   ├── api/              # API routes
│   │   ├── auth/         # NextAuth authentication endpoints
│   │   ├── people/       # People CRUD endpoints
│   │   ├── cards/        # Cards CRUD endpoints
│   │   ├── availability/ # Availability CRUD endpoints
│   │   ├── summary/      # Monthly summary endpoint
│   │   ├── exchange-rate/# Live forex rates endpoint
│   │   └── register/     # User registration endpoint
│   ├── login/            # Login page
│   ├── register/         # Registration page
│   ├── people/           # People management page
│   ├── cards/            # Cards management page
│   ├── availability/     # Availability management page
│   ├── layout.tsx        # Root layout with navigation & SessionProvider
│   └── page.tsx          # Dashboard with exchange rates
├── components/
│   ├── ui/               # Reusable UI components (Button, Card, Input, etc.)
│   └── Navigation.tsx    # Main navigation with user info and logout
├── lib/
│   ├── auth.ts           # NextAuth configuration
│   ├── auth-helper.ts    # Auth utility functions
│   └── prisma.ts         # Prisma client instance
├── types/
│   └── next-auth.d.ts    # NextAuth TypeScript definitions
├── prisma/
│   ├── schema.prisma     # Database schema with User, Person, Card, MonthlyAvailability
│   └── migrations/       # Database migrations
├── middleware.ts         # Route protection middleware
├── SETUP.md              # Detailed setup instructions
└── README.md
```

## License

MIT
