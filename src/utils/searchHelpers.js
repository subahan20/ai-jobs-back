const SKILL_DICTIONARY = {
  react: 'React.js', 'react.js': 'React.js', reactjs: 'React.js',
  angular: 'Angular', vue: 'Vue.js', node: 'Node.js', 'node.js': 'Node.js',
  express: 'Express.js', typescript: 'TypeScript', javascript: 'JavaScript',
  js: 'JavaScript', ts: 'TypeScript', python: 'Python', django: 'Django',
  flask: 'Flask', java: 'Java', spring: 'Spring Boot', kotlin: 'Kotlin',
  swift: 'Swift', docker: 'Docker', kubernetes: 'Kubernetes', k8s: 'Kubernetes',
  aws: 'AWS', azure: 'Azure', gcp: 'GCP', 'next.js': 'Next.js', nextjs: 'Next.js',
  tailwind: 'TailwindCSS', tailwindcss: 'TailwindCSS', css: 'CSS3', html: 'HTML5',
  sql: 'SQL', mongodb: 'MongoDB', postgres: 'PostgreSQL', postgresql: 'PostgreSQL',
  graphql: 'GraphQL', redux: 'Redux', git: 'Git',
};

const SKILL_DICTIONARY_KEYS = Object.keys(SKILL_DICTIONARY);

export function parseNaukriExperience(expStr) {
  if (typeof expStr === 'number') return expStr;
  if (!expStr || typeof expStr !== 'string') return 0;
  const match = expStr.match(/(\d+)\s*(?:-|to)\s*(\d+)/i) || expStr.match(/(\d+)\s*yrs?/i);
  return match ? parseInt(match[1], 10) : 0;
}

export function getExperienceLevel(minYears) {
  if (minYears <= 1) return 'Junior';
  if (minYears <= 3) return 'Mid';
  if (minYears <= 7) return 'Senior';
  return 'Lead';
}

export function deduceSkills(title, description, userSkills) {
  const titleLower = (title || '').toLowerCase();
  const descLower = (description || '').toLowerCase();
  const found = new Set();

  for (const skill of userSkills) {
    const clean = skill.trim().toLowerCase();
    if (clean && (titleLower.includes(clean) || descLower.includes(clean))) {
      found.add(skill.charAt(0).toUpperCase() + skill.slice(1));
    }
  }

  for (const key of SKILL_DICTIONARY_KEYS) {
    if (titleLower.includes(key) || descLower.includes(key)) {
      found.add(SKILL_DICTIONARY[key]);
    }
  }

  return Array.from(found);
}
