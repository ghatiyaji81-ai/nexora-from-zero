export const BUILD_TEMPLATES = [
  { id: 'blank', name: 'Blank project', description: 'Start with a README and an empty source folder.' },
  { id: 'html', name: 'HTML, CSS and JavaScript', description: 'A browser-ready static site starter.' },
  { id: 'node', name: 'Node.js', description: 'A JavaScript entry point and package manifest.' },
  { id: 'typescript', name: 'TypeScript', description: 'A typed JavaScript entry point and package manifest.' },
  { id: 'react', name: 'React', description: 'A Vite-based React starter manifest and source files.' },
  { id: 'nextjs', name: 'Next.js', description: 'A Next.js app-router starter manifest and source files.' },
  { id: 'python', name: 'Python', description: 'A Python entry point and requirements file.' },
  { id: 'flask', name: 'Flask', description: 'A Flask app starter and requirements file.' },
  { id: 'django', name: 'Django', description: 'A Django starter manifest and requirements file.' },
  { id: 'express', name: 'Express', description: 'An Express API starter manifest and source file.' },
  { id: 'java', name: 'Java', description: 'A minimal Java application source file.' },
  { id: 'c', name: 'C', description: 'A minimal C program.' },
  { id: 'cpp', name: 'C++', description: 'A minimal C++ program.' },
  { id: 'data-science', name: 'Data science', description: 'A Python data-science starter and dependency list.' },
  { id: 'machine-learning', name: 'Machine learning', description: 'A Python machine-learning starter and dependency list.' },
] as const;

export type BuildTemplateId = (typeof BUILD_TEMPLATES)[number]['id'];

export function isBuildTemplateId(value: unknown): value is BuildTemplateId {
  return typeof value === 'string' && BUILD_TEMPLATES.some(template => template.id === value);
}

export function safeBuildPath(value: string) {
  if (!value || value.length > 240 || value !== value.trim() || value.includes('\\') || /[\u0000-\u001f\u007f]/.test(value)) return null;
  const segments = value.split('/');
  if (segments.some(segment => !segment || segment === '.' || segment === '..' || !/^[A-Za-z0-9._-]{1,100}$/.test(segment))) return null;
  if (/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(segments.at(-1) ?? '')) return null;
  return segments.join('/');
}

export function getBuildTemplateFiles(template: BuildTemplateId, title: string) {
  const readme = `# ${title}\n\nCreated in NEXORA BUILD. Review this project before running any code.\n`;
  switch (template) {
    case 'html':
      return [{ path: 'README.md', content: readme }, { path: 'index.html', content: '<!doctype html>\n<html lang="en">\n<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>My app</title><link rel="stylesheet" href="styles.css"></head>\n<body><main><h1>Hello, BUILD</h1><p>Edit this page in your workspace.</p></main><script src="main.js"></script></body>\n</html>\n' }, { path: 'styles.css', content: 'body { margin: 0; font: 16px system-ui, sans-serif; }\nmain { max-width: 48rem; margin: 4rem auto; padding: 0 1rem; }\n' }, { path: 'main.js', content: "document.querySelector('h1')?.addEventListener('click', () => console.log('Hello, BUILD'));\n" }];
    case 'node':
      return [{ path: 'README.md', content: readme }, { path: 'package.json', content: JSON.stringify({ name: 'my-app', version: '1.0.0', private: true, scripts: { start: 'node src/index.js' } }, null, 2) + '\n' }, { path: 'src/index.js', content: "console.log('Hello, BUILD');\n" }];
    case 'typescript':
      return [{ path: 'README.md', content: readme }, { path: 'package.json', content: JSON.stringify({ name: 'my-app', version: '1.0.0', private: true, scripts: { build: 'tsc' }, devDependencies: { typescript: '^5.0.0' } }, null, 2) + '\n' }, { path: 'tsconfig.json', content: JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, outDir: 'dist' }, include: ['src/**/*.ts'] }, null, 2) + '\n' }, { path: 'src/index.ts', content: "const greeting: string = 'Hello, BUILD';\nconsole.log(greeting);\n" }];
    case 'react':
      return [{ path: 'README.md', content: readme }, { path: 'package.json', content: JSON.stringify({ name: 'my-app', version: '1.0.0', private: true, type: 'module', scripts: { dev: 'vite', build: 'vite build' }, dependencies: { react: '^19.0.0', 'react-dom': '^19.0.0' }, devDependencies: { '@vitejs/plugin-react': '^4.0.0', vite: '^6.0.0' } }, null, 2) + '\n' }, { path: 'index.html', content: '<div id="root"></div><script type="module" src="/src/main.jsx"></script>\n' }, { path: 'src/main.jsx', content: "import React from 'react';\nimport { createRoot } from 'react-dom/client';\n\nfunction App() { return <main><h1>Hello, BUILD</h1></main>; }\ncreateRoot(document.getElementById('root')).render(<App />);\n" }];
    case 'nextjs':
      return [{ path: 'README.md', content: readme }, { path: 'package.json', content: JSON.stringify({ name: 'my-app', version: '1.0.0', private: true, scripts: { dev: 'next dev', build: 'next build', start: 'next start' }, dependencies: { next: '^15.0.0', react: '^19.0.0', 'react-dom': '^19.0.0' } }, null, 2) + '\n' }, { path: 'app/page.tsx', content: "export default function Home() {\n  return <main><h1>Hello, BUILD</h1></main>;\n}\n" }, { path: 'app/layout.tsx', content: "import type { ReactNode } from 'react';\n\nexport default function RootLayout({ children }: { children: ReactNode }) {\n  return <html lang=\"en\"><body>{children}</body></html>;\n}\n" }];
    case 'python':
      return [{ path: 'README.md', content: readme }, { path: 'requirements.txt', content: '' }, { path: 'main.py', content: "def main() -> None:\n    print('Hello, BUILD')\n\n\nif __name__ == '__main__':\n    main()\n" }];
    case 'flask':
      return [{ path: 'README.md', content: readme }, { path: 'requirements.txt', content: 'Flask>=3,<4\n' }, { path: 'app.py', content: "from flask import Flask\n\napp = Flask(__name__)\n\n@app.get('/')\ndef home():\n    return 'Hello, BUILD'\n" }];
    case 'django':
      return [{ path: 'README.md', content: readme }, { path: 'requirements.txt', content: 'Django>=5,<6\n' }, { path: 'manage.py', content: "#!/usr/bin/env python\nimport os\nimport sys\n\nif __name__ == '__main__':\n    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')\n    from django.core.management import execute_from_command_line\n    execute_from_command_line(sys.argv)\n" }, { path: 'config/__init__.py', content: '' }, { path: 'config/settings.py', content: "SECRET_KEY = 'replace-with-a-private-secret-before-deployment'\nDEBUG = True\nALLOWED_HOSTS = ['localhost', '127.0.0.1']\nROOT_URLCONF = 'config.urls'\nINSTALLED_APPS = ['django.contrib.contenttypes', 'django.contrib.staticfiles']\nMIDDLEWARE = []\nDATABASES = {'default': {'ENGINE': 'django.db.backends.sqlite3', 'NAME': 'db.sqlite3'}}\nDEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'\n" }, { path: 'config/urls.py', content: "from django.http import HttpResponse\nfrom django.urls import path\n\nurlpatterns = [path('', lambda _request: HttpResponse('Hello, BUILD'))]\n" }];
    case 'express':
      return [{ path: 'README.md', content: readme }, { path: 'package.json', content: JSON.stringify({ name: 'my-api', version: '1.0.0', private: true, type: 'module', scripts: { start: 'node src/index.js' }, dependencies: { express: '^5.0.0' } }, null, 2) + '\n' }, { path: 'src/index.js', content: "import express from 'express';\n\nconst app = express();\napp.get('/', (_request, response) => response.json({ message: 'Hello, BUILD' }));\n" }];
    case 'java':
      return [{ path: 'README.md', content: readme }, { path: 'src/Main.java', content: 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, BUILD");\n    }\n}\n' }];
    case 'c':
      return [{ path: 'README.md', content: readme }, { path: 'src/main.c', content: '#include <stdio.h>\n\nint main(void) {\n    puts("Hello, BUILD");\n    return 0;\n}\n' }];
    case 'cpp':
      return [{ path: 'README.md', content: readme }, { path: 'src/main.cpp', content: '#include <iostream>\n\nint main() {\n    std::cout << "Hello, BUILD\\n";\n    return 0;\n}\n' }];
    case 'data-science':
      return [{ path: 'README.md', content: readme }, { path: 'requirements.txt', content: 'numpy\npandas\nmatplotlib\n' }, { path: 'main.py', content: "import pandas as pd\n\n\ndef main() -> None:\n    print(pd.DataFrame({'message': ['Hello, BUILD']}))\n\n\nif __name__ == '__main__':\n    main()\n" }];
    case 'machine-learning':
      return [{ path: 'README.md', content: readme }, { path: 'requirements.txt', content: 'scikit-learn\n' }, { path: 'main.py', content: "from sklearn.dummy import DummyClassifier\n\nprint('Add a dataset and define a model pipeline.')\n" }];
    case 'blank':
      return [{ path: 'README.md', content: readme }, { path: 'src/.gitkeep', content: '' }];
  }
}

export type BuildFinding = {
  rule: string;
  severity: 'high' | 'medium' | 'low';
  title: string;
  path: string;
  line: number;
  explanation: string;
  status: 'needs_review';
};

const SCANNER_RULES: Array<{ rule: string; severity: BuildFinding['severity']; title: string; explanation: string; pattern: RegExp }> = [
  { rule: 'possible-hardcoded-secret', severity: 'high', title: 'Possible hardcoded credential', explanation: 'A credential-like assignment may contain a literal secret. Verify the match and move real secrets to a protected server-side configuration.', pattern: /\b(?:api[_-]?key|client[_-]?secret|password|access[_-]?token|auth[_-]?token)\b\s*[:=]\s*['"`][^'"`\r\n]{8,}['"`]/i },
  { rule: 'public-secret-environment', severity: 'high', title: 'Potential secret exposed to a public environment', explanation: 'A NEXT_PUBLIC_ variable name appears to contain a credential term. Public-prefixed values are shipped to browsers.', pattern: /\bNEXT_PUBLIC_[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|API_KEY)[A-Z0-9_]*\b/i },
  { rule: 'dynamic-code-execution', severity: 'medium', title: 'Dynamic code execution pattern', explanation: 'Dynamic evaluation can execute data as code. Confirm the value is trusted and consider a safer alternative.', pattern: /\beval\s*\(|\bnew\s+Function\s*\(/ },
  { rule: 'unsafe-html-rendering', severity: 'medium', title: 'Raw HTML rendering pattern', explanation: 'Raw HTML rendering can create cross-site scripting risk if content is not safely sanitized.', pattern: /dangerouslySetInnerHTML/ },
  { rule: 'unsafe-deserialization', severity: 'medium', title: 'Potentially unsafe deserialization', explanation: 'Deserializing untrusted data using a general-purpose object loader may execute code or construct unsafe objects.', pattern: /\bpickle\.loads?\s*\(/ },
];

export function scanBuildFiles(files: Array<{ path: string; content: string }>) {
  const findings: BuildFinding[] = [];
  for (const file of files) {
    const lines = file.content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      for (const rule of SCANNER_RULES) {
        if (rule.pattern.test(lines[index])) {
          findings.push({ rule: rule.rule, severity: rule.severity, title: rule.title, path: file.path, line: index + 1, explanation: rule.explanation, status: 'needs_review' });
          if (findings.length >= 200) return findings;
        }
      }
    }
  }
  return findings;
}
