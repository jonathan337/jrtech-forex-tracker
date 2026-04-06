import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const email =
    process.env.SEED_USER_EMAIL?.trim() ||
    process.env.NEXT_PUBLIC_SEED_USER_EMAIL?.trim()

  const user = email
    ? await prisma.user.findUnique({ where: { email } })
    : await prisma.user.findFirst({ orderBy: { createdAt: 'asc' } })

  if (!user) {
    console.error('No User row found. Register in the app first, or set SEED_USER_EMAIL.')
    process.exit(1)
  }

  const totalPeople = await prisma.person.count()
  if (totalPeople > 0) {
    console.log(
      `Skip: Person table already has ${totalPeople} row(s). Delete them first if you really want a fresh seed.`
    )
    return
  }

  const person = await prisma.person.create({
    data: {
      userId: user.id,
      name: 'JRTech (add your providers here)',
      email: user.email,
      phone: '+1 (868) 555-0100',
      notes:
        'Auto-seeded because Person had no rows. Rename, add more people, then add cards.',
    },
  })

  await prisma.card.create({
    data: {
      personId: person.id,
      cardNickname: 'First card — edit in Cards',
      notes: 'Placeholder. Set availability or recurring rules as needed.',
    },
  })

  console.log(`Done: seeded 1 Person + 1 Card for ${user.email} (${user.id}).`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
