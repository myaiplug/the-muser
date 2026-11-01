import mongoose from 'mongoose'
import { TYPES } from '../taxonomy/taxonomy.mjs'
import { PROVENANCE } from './validate.mjs'

// Metadata only. Audio bytes never live in Mongo: `file` is a relative path
// served from static hosting, repo files, or a Hugging Face dataset.
export const soundSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true },
    type: { type: String, required: true, enum: TYPES, index: true },
    category: { type: String, required: true, index: true },
    tags: { type: [String], index: true },
    genres: { type: [String], index: true },
    license: { type: String, required: true, index: true },
    license_url: { type: String, required: true },
    author: { type: String, required: true },
    source: { type: String, required: true },
    source_url: { type: String, required: true },
    provenance: { type: String, required: true, enum: PROVENANCE },
    attribution_text: { type: String, required: true },
    processing: String,
    file: { type: String, required: true },
    sha256: { type: String, required: true, unique: true },
    bytes: Number,
    duration_ms: Number,
    sample_rate: Number,
    origin_path: String,
    notes: String,
  },
  { versionKey: false, collection: 'sounds' },
)
soundSchema.index({ title: 'text', tags: 'text' })

export function getModel(conn = mongoose) {
  return conn.models.Sound || conn.model('Sound', soundSchema)
}
