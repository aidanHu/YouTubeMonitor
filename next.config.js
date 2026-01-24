/** @type {import('next').NextConfig} */
const nextConfig = {
    output: 'export',
    images: {
        unoptimized: true,
    },
    typescript: {
        ignoreBuildErrors: true,
    },
    // serverExternalPackages removed as we are not running a node server
};

module.exports = nextConfig;
