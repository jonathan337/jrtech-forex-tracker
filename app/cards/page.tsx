'use client'

import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, Edit, Trash2, X, CreditCard as CreditCardIcon, User, Loader2 } from 'lucide-react'

interface Person {
  id: string
  name: string
}

interface CardType {
  id: string
  cardNickname: string
  lastFourDigits: string | null
  notes: string | null
  person: Person
  monthlyAvailability: Array<{
    id: string
    year: number
    month: number
  }>
}

export default function CardsPage() {
  const [cards, setCards] = useState<CardType[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingCard, setEditingCard] = useState<CardType | null>(null)
  const [formData, setFormData] = useState({
    personId: '',
    cardNickname: '',
    lastFourDigits: '',
    notes: '',
  })
  const [saving, setSaving] = useState(false)
  const savingLockRef = useRef(false)

  useEffect(() => {
    fetchCards()
    fetchPeople()
  }, [])

  const fetchCards = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/cards')
      if (response.ok) {
        const data = await response.json()
        setCards(data)
      }
    } catch (error) {
      console.error('Error fetching cards:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchPeople = async () => {
    try {
      const response = await fetch('/api/people')
      if (response.ok) {
        const data = await response.json()
        setPeople(data)
      }
    } catch (error) {
      console.error('Error fetching people:', error)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (savingLockRef.current) return
    savingLockRef.current = true
    setSaving(true)
    try {
      const url = editingCard ? `/api/cards/${editingCard.id}` : '/api/cards'
      const method = editingCard ? 'PUT' : 'POST'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      if (response.ok) {
        await fetchCards()
        resetForm()
      }
    } catch (error) {
      console.error('Error saving card:', error)
    } finally {
      savingLockRef.current = false
      setSaving(false)
    }
  }

  const handleEdit = (card: CardType) => {
    setEditingCard(card)
    setFormData({
      personId: card.person.id,
      cardNickname: card.cardNickname,
      lastFourDigits: card.lastFourDigits || '',
      notes: card.notes || '',
    })
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this card?')) return

    try {
      const response = await fetch(`/api/cards/${id}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        await fetchCards()
      }
    } catch (error) {
      console.error('Error deleting card:', error)
    }
  }

  const resetForm = () => {
    setFormData({ personId: '', cardNickname: '', lastFourDigits: '', notes: '' })
    setEditingCard(null)
    setShowForm(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            Cards
          </h1>
          <p className="text-gray-600 mt-1">Manage credit cards that provide foreign currency access</p>
        </div>
        <Button onClick={() => setShowForm(true)} className="shadow-lg">
          <Plus className="w-4 h-4 mr-2" />
          Add Card
        </Button>
      </div>

      {showForm && (
        <Card className="border-2 border-blue-200 shadow-xl">
          <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl">
                  {editingCard ? 'Edit Card' : 'Add New Card'}
                </CardTitle>
                <p className="text-sm text-gray-600 mt-1">
                  {editingCard ? 'Update card information' : 'Register a new credit card'}
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
              <div>
                <Label htmlFor="personId">Card Owner *</Label>
                <select
                  id="personId"
                  value={formData.personId}
                  onChange={(e) =>
                    setFormData({ ...formData, personId: e.target.value })
                  }
                  required
                  disabled={saving}
                  className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="">Select a person</option>
                  {people.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="cardNickname">Card Nickname *</Label>
                <Input
                  id="cardNickname"
                  value={formData.cardNickname}
                  onChange={(e) =>
                    setFormData({ ...formData, cardNickname: e.target.value })
                  }
                  placeholder="e.g., John's Visa"
                  required
                  disabled={saving}
                />
              </div>
              <div>
                <Label htmlFor="lastFourDigits">Last 4 Digits</Label>
                <Input
                  id="lastFourDigits"
                  value={formData.lastFourDigits}
                  onChange={(e) =>
                    setFormData({ ...formData, lastFourDigits: e.target.value })
                  }
                  placeholder="1234"
                  maxLength={4}
                  disabled={saving}
                />
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
                  placeholder="Payment arrangements, special conditions..."
                  disabled={saving}
                />
              </div>
              <div className="flex gap-2 pt-4 border-t">
                <Button type="submit" className="px-8" disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {editingCard ? 'Updating…' : 'Creating…'}
                    </>
                  ) : editingCard ? (
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

      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-gray-500 mt-4">Loading cards...</p>
        </div>
      ) : cards.length === 0 ? (
        <Card className="shadow-md">
          <CardContent className="py-12 text-center">
            <CreditCardIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-700 mb-2">No Cards Added</h3>
            <p className="text-gray-500 mb-4">Add your first credit card to start tracking</p>
            <Button onClick={() => setShowForm(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add First Card
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <Card key={card.id} className="shadow-md hover:shadow-lg transition-shadow">
              <CardHeader className="bg-gradient-to-r from-blue-50 to-cyan-50 border-b">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                      <CreditCardIcon className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{card.cardNickname}</CardTitle>
                      {card.lastFourDigits && (
                        <p className="text-sm text-gray-500 font-mono">
                          •••• {card.lastFourDigits}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(card)}
                      className="hover:bg-blue-100"
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(card.id)}
                      className="hover:bg-red-100"
                    >
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
                  <User className="w-4 h-4 text-gray-400" />
                  <span className="font-medium">Owner:</span>
                  <span>{card.person.name}</span>
                </div>
                
                {card.notes && (
                  <div className="bg-gray-50 rounded-lg p-3 mb-3">
                    <p className="text-sm text-gray-600 line-clamp-2">{card.notes}</p>
                  </div>
                )}

                <div className="flex items-center justify-between pt-3 border-t border-gray-200">
                  <span className="text-sm text-gray-600">Monthly entries:</span>
                  {card.monthlyAvailability.length === 0 ? (
                    <span className="text-sm text-gray-400">None</span>
                  ) : (
                    <span className="px-2 py-1 bg-blue-100 text-blue-700 text-sm rounded-full font-medium">
                      {card.monthlyAvailability.length}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
