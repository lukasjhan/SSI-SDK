import express, { NextFunction, RequestHandler } from 'express'
import { ParamsDictionary } from 'express-serve-static-core'
import passport from 'passport'
import { ParsedQs } from 'qs'
import { EndpointArgs, hasEndpointOpts, HasEndpointOpts } from './types'

export const checkUserIsInRole = (opts: { roles: string | string[] }) => (req: express.Request, res: express.Response, next: NextFunction) => {
  if (!opts?.roles || opts.roles.length === 0) {
    return next()
  }
  const roles = Array.isArray(opts.roles) ? opts.roles : [opts.roles]
  if (!req?.user || !('role' in req.user)) {
    return res.status(401).end()
  }

  // @ts-ignore
  const hasRole = roles.find((role) => req.user.role.toLowerCase() === role.toLowerCase())
  if (!hasRole) {
    return res.status(403).end()
  }

  return next()
}

const checkAuthenticationImpl = (req: express.Request, res: express.Response, next: express.NextFunction, opts?: EndpointArgs) => {
  if (!opts || !opts.authentication || opts.authentication.enabled === false) {
    return next()
  }
  if (!opts.authentication.strategy) {
    return res.status(401).end()
  }
  const options = { authInfo: true, session: false }
  passport
    .authenticate(
      opts.authentication.strategy,
      options,
      (
        err: any,
        user?: Express.User | false | null,
        _info?: object | string | Array<string | undefined>,
        _status?: number | Array<number | undefined>
      ) => {
        if (err) {
          return next({ statusCode: 403, message: err })
        } else if (!user) {
          return next({ statusCode: 403, message: 'user not found' })
        }
        if (options.session) {
          req.logIn(user, function (err) {
            if (err) {
              return next(err)
            }
            return res.send(user)
          })
        }
        return next()
      }
    )
    .call(this, req, res, next)
  // next()
}
const checkAuthorizationImpl = (req: express.Request, res: express.Response, next: express.NextFunction, opts?: EndpointArgs) => {
  if (!opts || !opts.authentication || !opts.authorization || opts.authentication.enabled === false || opts?.authorization.enabled === false) {
    return next()
  }
  /*if (!req.isAuthenticated()) {
        return sendErrorResponse(res, 403, 'Authorization with an unauthenticated request is not possible')
    }*/
  const authorization = opts.authorization

  if (!authorization.enforcer && (!authorization.requireUserInRoles || authorization.requireUserInRoles.length === 0)) {
    console.log(`Authorization enabled for endpoint, but no enforcer or roles supplied`)
    return res.status(401).end()
  }
  if (authorization.requireUserInRoles && authorization.requireUserInRoles.length > 0) {
    checkUserIsInRole({ roles: authorization.requireUserInRoles })
  }
  if (authorization.enforcer) {
    const enforcer = authorization.enforcer
    const permitted = enforcer.enforceSync(req.user, opts.resource, opts.operation)
    if (!permitted) {
      console.log(`Access to ${opts.resource} and op ${opts.operation} not allowed for ${req.user}`)
      return res.status(403).end()
    }
  }
  return next()
}

export const checkAuthenticationOnly = (opts?: EndpointArgs) => (req: express.Request, res: express.Response, next: express.NextFunction) => {
  // executeRequestHandlers(req, res, next, opts)
  return checkAuthenticationImpl(req, res, next, opts)
}

export const checkAuthorizationOnly = (opts?: EndpointArgs) => (req: express.Request, res: express.Response, next: express.NextFunction) => {
  // executeRequestHandlers(req, res, next, opts)
  return checkAuthorizationImpl(req, res, next, opts)
}
export const checkAuth = (opts?: EndpointArgs): RequestHandler<ParamsDictionary, any, any, ParsedQs, Record<string, any>>[] => {
  const handlers: RequestHandler<ParamsDictionary, any, any, ParsedQs, Record<string, any>>[] = []
  handlers.push(checkAuthenticationOnly(opts))
  handlers.push(checkAuthorizationOnly(opts))
  opts?.handlers && handlers.push(...opts.handlers)
  return handlers
}

export function copyGlobalAuthToEndpoint(args?: { opts?: HasEndpointOpts; key: string }) {
  const opts = args?.opts
  const key = args?.key
  if (!opts || !key || !hasEndpointOpts(opts)) {
    return
  }
  if (opts.endpointOpts?.globalAuth) {
    if (opts.endpointOpts[key]?.disableGlobalAuth === true) {
      return
    }
    opts.endpointOpts[key] = {
      ...opts.endpointOpts[key],
      endpoint: { ...opts.endpointOpts.globalAuth, ...opts.endpointOpts[key]?.endpoint },
    }
  }
}

export function copyGlobalAuthToEndpoints(args?: { opts?: HasEndpointOpts; keys: string[] }) {
  args?.keys.forEach((key) => copyGlobalAuthToEndpoint({ opts: args?.opts, key }))
}
