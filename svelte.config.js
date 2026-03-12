import adapter from '@sveltejs/adapter-node';

const config = {
  kit: {
    adapter: adapter(),
    paths: { base: '/plans' }
  }
};

export default config;
