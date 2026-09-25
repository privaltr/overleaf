import AuthenticationController from '../Authentication/AuthenticationController.mjs'
import TemplateLibraryController from './TemplateLibraryController.mjs'
import RateLimiterMiddleware from '../Security/RateLimiterMiddleware.mjs'
import { RateLimiter } from '../../infrastructure/RateLimiter.mjs'

const writeRateLimiter = new RateLimiter('template-library-write', {
  points: 120,
  duration: 60,
})

export default {
  apply(app) {
    app.get(
      '/template-library/templates',
      AuthenticationController.requireLogin(),
      TemplateLibraryController.getAll
    )

    app.post(
      '/template-library/templates',
      AuthenticationController.requireLogin(),
      RateLimiterMiddleware.rateLimit(writeRateLimiter),
      TemplateLibraryController.create
    )

    app.post(
      '/template-library/templates/import',
      AuthenticationController.requireLogin(),
      RateLimiterMiddleware.rateLimit(writeRateLimiter),
      TemplateLibraryController.importTemplates
    )

    app.put(
      '/template-library/templates/:templateId',
      AuthenticationController.requireLogin(),
      RateLimiterMiddleware.rateLimit(writeRateLimiter),
      TemplateLibraryController.update
    )

    app.delete(
      '/template-library/templates/:templateId',
      AuthenticationController.requireLogin(),
      RateLimiterMiddleware.rateLimit(writeRateLimiter),
      TemplateLibraryController.remove
    )

    app.post(
      '/template-library/templates/:templateId/duplicate',
      AuthenticationController.requireLogin(),
      RateLimiterMiddleware.rateLimit(writeRateLimiter),
      TemplateLibraryController.duplicate
    )
  },
}
