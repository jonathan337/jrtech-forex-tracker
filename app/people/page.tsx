'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, Edit, Trash2, X, Mail, Phone, User, Loader2 } from 'lucide-react'
import {
  canonicalNanpFromNationalDigits,
  extractNanpNationalDigits,
  formatNanpNationalInput,
  isValidNanpNational,
} from '@/lib/phone'

interface Person {
  id: string
  name: string
  email: string | null
  phone: string | null
  notes: string | null
  cards: Array<{
    id: string
    cardNickname: string
  }>
}

export default function PeoplePage() {
  const router = useRouter()
  const { status, data: session } = useSession()
  const [people, setPeople] = useState<Person[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingPerson, setEditingPerson] = useState<Person | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    /** 0–10 national digits only (after +1); keeps backspace + mask stable */
    phoneNational: '',
    notes: '',
  })
  const [saving, setSaving] = useState(false)
  const savingLockRef = useRef(false)
  const [formError, setFormError] = useState('')
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login')
    }
  }, [status, router])

  useEffect(() => {
    if (status !== 'authenticated' || !session?.user?.id) return
    fetchPeople()
  }, [status, session?.user?.id])

  useEffect(() => {
    const onVisible = () => {
      if (
        document.visibilityState === 'visible' &&
        status === 'authenticated' &&
        session?.user?.id
      ) {
        fetchPeople()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [status, session?.user?.id])

  const fetchPeople = async () => {
    setLoading(true)
    setLoadError('')
    try {
      const url =
        typeof window !== 'undefined'
          ? new URL('/api/people', window.location.origin).toString()
          : '/api/people'
      const response = await fetch(url, {
        credentials: 'include',
        cache: 'no-store',
      })
      const contentType = response.headers.get('content-type') ?? ''
      if (response.ok) {
        if (!contentType.includes('application/json')) {
          setLoadError(
            'People API returned non-JSON (often HTML). Confirm the request URL is /api/people in the Network tab.'
          )
          setPeople([])
          return
        }
        const data = await response.json()
        setPeople(Array.isArray(data) ? data : [])
      } else {
        const body = await response.json().catch(() => ({}))
        const parts = [
          typeof body.error === 'string'
            ? body.error
            : `Could not load people (${response.status}).`,
          typeof body.detail === 'string' ? body.detail : '',
        ].filter(Boolean)
        setLoadError(parts.join(' '))
        setPeople([])
      }
    } catch (error) {
      console.error('Error fetching people:', error)
      setLoadError('Network error while loading people.')
      setPeople([])
    } finally {
      setLoading(false)
    }
  }

  const openAddForm = () => {
    setEditingPerson(null)
    setFormError('')
    setFormData({ name: '', email: '', phoneNational: '', notes: '' })
    setShowForm(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (savingLockRef.current) return

    if (!isValidNanpNational(formData.phoneNational)) {
      setFormError('Enter a complete phone number: +1 (XXX) XXX-XXXX.')
      return
    }

    savingLockRef.current = true
    setSaving(true)
    setFormError('')
    try {
      const url = editingPerson ? `/api/people/${editingPerson.id}` : '/api/people'
      const method = editingPerson ? 'PUT' : 'POST'

      const { phoneNational, ...rest } = formData
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...rest,
          phone: canonicalNanpFromNationalDigits(phoneNational),
        }),
      })

      if (response.ok) {
        await fetchPeople()
        resetForm()
      } else {
        const data = await response.json().catch(() => ({}))
        setFormError(
          typeof data.error === 'string'
            ? data.error
            : 'Could not save this person. Please check your entries.'
        )
      }
    } catch (error) {
      console.error('Error saving person:', error)
    } finally {
      savingLockRef.current = false
      setSaving(false)
    }
  }

  const handleEdit = (person: Person) => {
    setEditingPerson(person)
    setFormError('')
    setFormData({
      name: person.name,
      email: person.email || '',
      phoneNational: person.phone
        ? extractNanpNationalDigits(person.phone)
        : '',
      notes: person.notes || '',
    })
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this person?')) return

    try {
      const response = await fetch(`/api/people/${id}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        await fetchPeople()
      }
    } catch (error) {
      console.error('Error deleting person:', error)
    }
  }

  const resetForm = () => {
    setFormData({ name: '', email: '', phoneNational: '', notes: '' })
    setEditingPerson(null)
    setFormError('')
    setShowForm(false)
  }

  if (status === 'loading' || status === 'unauthenticated') {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            People
          </h1>
          <p className="text-gray-600 mt-1">Manage your foreign currency providers</p>
        </div>
        <Button onClick={openAddForm} className="shadow-lg">
          <Plus className="w-4 h-4 mr-2" />
          Add Person
        </Button>
      </div>

      {showForm && (
        <Card className="border-2 border-blue-200 shadow-xl">
          <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl">
                  {editingPerson ? 'Edit Person' : 'Add New Person'}
                </CardTitle>
                <p className="text-sm text-gray-600 mt-1">
                  {editingPerson ? 'Update person information' : 'Add a new currency provider'}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={resetForm}
                disabled={saving}
                aria-label="Close form"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              {formError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
                  {formError}
                </div>
              )}
              <div>
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="John Doe"
                  required
                  disabled={saving}
                />
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  placeholder="john@example.com"
                  disabled={saving}
                />
              </div>
              <div>
                <Label htmlFor="phone">Phone *</Label>
                <Input
                  id="phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  value={formatNanpNationalInput(formData.phoneNational)}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      phoneNational: extractNanpNationalDigits(e.target.value),
                    })
                  }
                  placeholder="+1 (868) 555-1234"
                  disabled={saving}
                  aria-required="true"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Required. North American +1 numbers only. Format is always +1 (XXX) XXX-XXXX.
                </p>
              </div>
              <div>
                <Label htmlFor="notes">Notes</Label>
                <textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) =>
                    setFormData({ ...formData, notes: e.target.value })
                  }
                  className="flex min-h-[80px] w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder="Any special arrangements or notes..."
                  disabled={saving}
                />
              </div>
              <div className="flex gap-2 pt-4 border-t">
                <Button type="submit" className="px-8" disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {editingPerson ? 'Updating…' : 'Creating…'}
                    </>
                  ) : editingPerson ? (
                    'Update'
                  ) : (
                    'Create'
                  )}
                </Button>
                <Button type="button" variant="outline" onClick={resetForm} disabled={saving}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {loadError && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 rounded-md text-sm space-y-2">
          <p className="font-medium">{loadError}</p>
          <p className="text-amber-800 text-xs">
            Local: ensure <code className="bg-amber-100 px-1 rounded">DATABASE_URL</code> is correct and
            Postgres is running; run{' '}
            <code className="bg-amber-100 px-1 rounded">npx prisma migrate deploy</code>. If you only set
            one URL, the app now mirrors <code className="bg-amber-100 px-1 rounded">DATABASE_URL</code> to{' '}
            <code className="bg-amber-100 px-1 rounded">DIRECT_URL</code> for development.
          </p>
          <Button type="button" variant="outline" size="sm" onClick={() => fetchPeople()}>
            Retry
          </Button>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-gray-500 mt-4">Loading people...</p>
        </div>
      ) : people.length === 0 && !loadError ? (
        <Card className="shadow-md">
          <CardContent className="py-12 text-center">
            <User className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-700 mb-2">No People Added</h3>
            <p className="text-gray-500 mb-4">Start by adding your foreign currency providers</p>
            <p className="text-sm text-gray-600 mb-4 max-w-md mx-auto">
              If you already have rows in Supabase but see this locally, your logged-in{' '}
              <code className="bg-gray-100 px-1 rounded text-xs">User.id</code> may not match{' '}
              <code className="bg-gray-100 px-1 rounded text-xs">Person.userId</code>. On{' '}
              <strong>local dev</strong>, open{' '}
              <Link href="/api/debug/me" className="text-blue-600 underline font-medium" target="_blank">
                /api/debug/me
              </Link>{' '}
              while signed in — it compares session id to row counts (404 on production).
            </p>
            <Button onClick={openAddForm}>
              <Plus className="w-4 h-4 mr-2" />
              Add First Person
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {people.map((person) => (
            <Card key={person.id} className="shadow-md hover:shadow-lg transition-shadow">
              <CardHeader className="bg-gradient-to-r from-purple-50 to-pink-50 border-b">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                      <span className="text-white font-bold text-lg">{person.name[0].toUpperCase()}</span>
                    </div>
                    <div>
                      <CardTitle className="text-lg">{person.name}</CardTitle>
                      <div className="flex items-center gap-1 mt-1">
                        <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full font-medium">
                          {person.cards.length} {person.cards.length === 1 ? 'card' : 'cards'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(person)}
                      className="hover:bg-purple-100"
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(person.id)}
                      className="hover:bg-red-100"
                    >
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                {person.email && (
                  <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                    <Mail className="w-4 h-4 text-gray-400" />
                    <span>{person.email}</span>
                  </div>
                )}
                {person.phone && (
                  <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                    <Phone className="w-4 h-4 text-gray-400" />
                    <span>{person.phone}</span>
                  </div>
                )}
                {person.notes && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <p className="text-sm text-gray-600 line-clamp-2">{person.notes}</p>
                  </div>
                )}
                {person.cards.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <p className="text-xs text-gray-500 mb-1 font-medium">Cards:</p>
                    <div className="flex flex-wrap gap-1">
                      {person.cards.map((card) => (
                        <span key={card.id} className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                          {card.cardNickname}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
