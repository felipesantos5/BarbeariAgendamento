import { useEffect } from 'react';

interface MetaTagsOptions {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  type?: string;
}

/**
 * Hook para atualizar meta tags dinamicamente
 * Essencial para compartilhamento correto em redes sociais e WhatsApp
 */
export function useMetaTags(options: MetaTagsOptions) {
  useEffect(() => {
    const {
      title,
      description,
      image,
      url,
      type = 'website'
    } = options;

    // Atualizar título da página
    if (title) {
      document.title = title;
    }

    // Função auxiliar para atualizar ou criar meta tag
    const updateMetaTag = (property: string, content: string, isName = false) => {
      const attribute = isName ? 'name' : 'property';
      let element = document.querySelector(`meta[${attribute}="${property}"]`);
      
      if (!element) {
        element = document.createElement('meta');
        element.setAttribute(attribute, property);
        document.head.appendChild(element);
      }
      
      element.setAttribute('content', content);
    };

    // Atualizar link canonical
    const updateCanonical = (href: string) => {
      let canonical = document.querySelector('link[rel="canonical"]');
      
      if (!canonical) {
        canonical = document.createElement('link');
        canonical.setAttribute('rel', 'canonical');
        document.head.appendChild(canonical);
      }
      
      canonical.setAttribute('href', href);
    };

    // Atualizar meta description
    if (description) {
      updateMetaTag('description', description, true);
    }

    // Atualizar Open Graph tags
    if (url) {
      updateMetaTag('og:url', url);
      updateCanonical(url);
    }

    if (title) {
      updateMetaTag('og:title', title);
    }

    if (description) {
      updateMetaTag('og:description', description);
    }

    if (image) {
      updateMetaTag('og:image', image);
    }

    if (type) {
      updateMetaTag('og:type', type);
    }

    // Atualizar Twitter Card tags
    if (url) {
      updateMetaTag('twitter:url', url, true);
    }

    if (title) {
      updateMetaTag('twitter:title', title, true);
    }

    if (description) {
      updateMetaTag('twitter:description', description, true);
    }

    if (image) {
      updateMetaTag('twitter:image', image, true);
    }

  }, [options.title, options.description, options.image, options.url, options.type]);
}
