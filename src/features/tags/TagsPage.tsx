import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useWorkspace } from '../../app/providers/WorkspaceProvider'
import { EmptyState } from '../../components/Controls'
import { Icon } from '../../components/Icon'
import { ApiError } from '../../services/api/client'
import { createTag, deleteTag, renameTag, type TagRef } from '../../services/api/secrets'

const errorText = (e: unknown) => (e instanceof ApiError ? [e.message, ...e.details].join(' ') : 'Something went wrong.')

export function TagsPage() {
  const { tags, reloadTags, bumpList } = useWorkspace()
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const name = String(new FormData(form).get('name') ?? '').trim()
    if (!name) return
    try {
      await createTag(name)
      form.reset()
      setError('')
      await reloadTags()
    } catch (err) {
      setError(errorText(err))
    }
  }

  async function onRename(e: FormEvent) {
    e.preventDefault()
    if (!editing) return
    try {
      await renameTag(editing.id, editing.name.trim())
      setEditing(null)
      setError('')
      await reloadTags()
      bumpList()
    } catch (err) {
      setError(errorText(err))
    }
  }

  async function onDelete(t: TagRef) {
    if (!window.confirm(`Delete tag "${t.name}"? It will be removed from all items.`)) return
    try {
      await deleteTag(t.id)
      await reloadTags()
      bumpList()
    } catch (err) {
      setError(errorText(err))
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Tags</h1>
          <p className="muted">Organise your items. Tag names are metadata and visible to the server.</p>
        </div>
      </div>

      <form className="add-row" onSubmit={(e) => void onCreate(e)}>
        <div className="search grow">
          <Icon name="tag" size={16} />
          <input name="name" placeholder="New tag name" maxLength={100} aria-label="New tag name" />
        </div>
        <button className="btn primary"><Icon name="plus" size={16} />Add tag</button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}

      {tags.length === 0 ? (
        <EmptyState icon="tag" title="No tags yet"><p className="muted">Tags like “production” or “payments” make items easy to find.</p></EmptyState>
      ) : (
        <div className="card list-card">
          {tags.map((t) => (
            <div key={t.id} className="list-row">
              {editing?.id === t.id ? (
                <form className="add-row grow" onSubmit={(e) => void onRename(e)}>
                  <input className="input" value={editing.name} onChange={(e) => setEditing({ id: t.id, name: e.target.value })} maxLength={100} aria-label="Tag name" autoFocus />
                  <button className="btn primary sm">Save</button>
                  <button type="button" className="btn ghost sm" onClick={() => setEditing(null)}>Cancel</button>
                </form>
              ) : (
                <>
                  <Link to={`/secrets?tag=${t.id}`} className="chip tag">{t.name}</Link>
                  <span className="spacer" />
                  <button type="button" className="icon-btn" title="Rename" aria-label={`Rename ${t.name}`} onClick={() => setEditing({ id: t.id, name: t.name })}><Icon name="pencil" size={16} /></button>
                  <button type="button" className="icon-btn danger" title="Delete" aria-label={`Delete ${t.name}`} onClick={() => void onDelete(t)}><Icon name="trash" size={16} /></button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
