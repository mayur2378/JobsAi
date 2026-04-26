export const SKILL_VOCABULARY: string[] = [
  // Languages
  'javascript', 'typescript', 'python', 'java', 'go', 'golang', 'rust', 'c++', 'c#', 'ruby',
  'swift', 'kotlin', 'scala', 'php', 'r', 'matlab', 'dart', 'elixir', 'haskell', 'clojure',
  // Frontend frameworks
  'react', 'vue', 'angular', 'svelte', 'next.js', 'nuxt.js', 'remix', 'gatsby',
  'react native', 'flutter', 'ionic', 'electron',
  // Backend frameworks
  'node.js', 'express', 'fastapi', 'django', 'flask', 'rails', 'spring', 'nestjs',
  'laravel', 'fastify', 'hapi', 'koa', 'gin', 'fiber', 'echo',
  // Databases
  'postgresql', 'mysql', 'mongodb', 'redis', 'elasticsearch', 'dynamodb', 'sqlite',
  'cassandra', 'neo4j', 'influxdb', 'cockroachdb', 'supabase', 'firebase',
  // Cloud & DevOps
  'aws', 'gcp', 'azure', 'docker', 'kubernetes', 'terraform', 'ansible', 'pulumi',
  'helm', 'jenkins', 'github actions', 'gitlab ci', 'circleci', 'argocd',
  'nginx', 'apache', 'caddy', 'traefik', 'cloudflare',
  // Tools & Platforms
  'git', 'github', 'gitlab', 'jira', 'confluence', 'figma', 'sketch',
  'vercel', 'netlify', 'heroku', 'railway', 'render',
  // APIs & Protocols
  'rest', 'graphql', 'grpc', 'websockets', 'oauth', 'jwt', 'saml',
  // CSS & UI
  'html', 'css', 'sass', 'tailwindcss', 'bootstrap', 'materialui', 'shadcn',
  // Testing
  'jest', 'vitest', 'cypress', 'playwright', 'pytest', 'junit', 'rspec', 'selenium',
  // Bundlers & Tooling
  'webpack', 'vite', 'rollup', 'babel', 'eslint', 'prettier', 'turbo', 'nx',
  // Data & AI/ML
  'machine learning', 'deep learning', 'tensorflow', 'pytorch', 'scikit-learn',
  'pandas', 'numpy', 'spark', 'hadoop', 'dbt', 'airflow', 'kafka',
  'langchain', 'openai', 'anthropic',
  // Messaging
  'rabbitmq', 'celery', 'sqs', 'pubsub',
  // Auth & Security
  'auth0', 'keycloak', 'ldap', 'sso',
  // Monitoring
  'datadog', 'grafana', 'prometheus', 'sentry', 'newrelic', 'splunk',
  // Methodologies
  'microservices', 'ci/cd', 'devops', 'sre', 'agile', 'scrum', 'tdd',
  'system design', 'data structures', 'algorithms',
  // Payments & Comms
  'stripe', 'twilio', 'sendgrid', 'resend',
  // Mobile
  'ios', 'android', 'expo',
  // Low-code / BaaS
  'appwrite', 'convex',
]

export function extractSkills(text: string): string[] {
  if (!text) return []
  return SKILL_VOCABULARY.filter((skill) => {
    const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const pattern = new RegExp(`(?<![\\w.])${escaped}(?![\\w.])`, 'i')
    return pattern.test(text)
  })
}
