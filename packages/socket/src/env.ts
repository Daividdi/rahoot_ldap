import { createEnv } from '@t3-oss/env-core'
import { z } from 'zod/v4'

const env = createEnv({
  server: {
    WEB_ORIGIN:          z.string().optional().default('http://localhost:3000'),
    SOCKER_PORT:         z.string().optional().default('3001'),
    LDAP_URL:            z.string().optional().default(''),
    LDAP_DOMAIN:         z.string().optional().default(''),
    LDAP_SEARCH_BASE:    z.string().optional().default(''),
    LDAP_SERVICE_USER:   z.string().optional(),
    LDAP_SERVICE_PASS:   z.string().optional(),
  },
  runtimeEnv: {
    WEB_ORIGIN:          process.env.WEB_ORIGIN,
    SOCKER_PORT:         process.env.SOCKER_PORT,
    LDAP_URL:            process.env.LDAP_URL,
    LDAP_DOMAIN:         process.env.LDAP_DOMAIN,
    LDAP_SEARCH_BASE:    process.env.LDAP_SEARCH_BASE,
    LDAP_SERVICE_USER:   process.env.LDAP_SERVICE_USER,
    LDAP_SERVICE_PASS:   process.env.LDAP_SERVICE_PASS,
  },
})

export default env
