import mongoose from '../infrastructure/Mongoose.mjs'

const { Schema } = mongoose

export const MAX_TEMPLATE_TITLE_LENGTH = 200
export const MAX_TEMPLATE_DESCRIPTION_LENGTH = 1000
export const MAX_TEMPLATE_CONTENT_LENGTH = 200_000
export const MAX_TEMPLATE_CATEGORIES = 30
export const MAX_TEMPLATE_CATEGORY_LENGTH = 80

export const TemplateSnippetSchema = new Schema(
  {
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: MAX_TEMPLATE_TITLE_LENGTH,
    },
    description: {
      type: String,
      default: '',
      trim: true,
      maxlength: MAX_TEMPLATE_DESCRIPTION_LENGTH,
    },
    content: {
      type: String,
      required: true,
      maxlength: MAX_TEMPLATE_CONTENT_LENGTH,
    },
    categories: {
      type: [String],
      default: [],
      validate: {
        validator(categories) {
          return (
            categories.length <= MAX_TEMPLATE_CATEGORIES &&
            categories.every(
              category => category.length <= MAX_TEMPLATE_CATEGORY_LENGTH
            )
          )
        },
        message: 'Invalid template categories.',
      },
    },
  },
  {
    collection: 'templateSnippets',
    minimize: false,
    timestamps: true,
  }
)

TemplateSnippetSchema.index({ user_id: 1, updatedAt: -1 })

export const TemplateSnippet = mongoose.model(
  'TemplateSnippet',
  TemplateSnippetSchema
)
