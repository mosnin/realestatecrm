import Link from 'next/link';

const features = [
  {
    title: 'Client Pipeline Management',
    description:
      'Track every client through qualification, tour, and application with a clear lifecycle view.'
  },
  {
    title: 'Deals and Stages',
    description:
      'Manage transactions end-to-end with deal stages, priorities, and values in one dashboard.'
  },
  {
    title: 'AI Assistant',
    description:
      'Get instant summaries and insights about your pipeline, clients, and deals using AI.'
  },
  {
    title: 'Workspace Settings',
    description:
      'Configure branding, notifications, connections, and billing details for your team.'
  }
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <header className="max-w-6xl mx-auto px-6 py-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Real Estate CRM</h1>
        <div className="flex items-center gap-3">
          <Link
            href="/sign-in"
            className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="text-sm bg-blue-600 text-white px-4 py-2 rounded-md font-medium hover:bg-blue-700 transition-colors"
          >
            Get started
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-12">
        <section className="text-center max-w-3xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-gray-900">
            The all-in-one CRM for modern real estate teams
          </h2>
          <p className="mt-5 text-lg text-gray-600">
            Manage clients, leads, and deals in one place with an experience
            designed for fast-moving agents and brokerages.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link
              href="/sign-up"
              className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              Create your account
            </Link>
            <Link
              href="/sign-in"
              className="px-6 py-3 rounded-lg font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Sign in
            </Link>
          </div>
        </section>

        <section className="mt-16 grid grid-cols-1 md:grid-cols-2 gap-5">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
            >
              <h3 className="text-lg font-semibold text-gray-900">{feature.title}</h3>
              <p className="mt-2 text-sm text-gray-600">{feature.description}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
