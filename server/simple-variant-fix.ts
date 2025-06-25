// Simple variant extraction that works with any product structure
export function extractVariantsSimple(html: string) {
  const colors: string[] = [];
  const sizes: string[] = [];
  
  // For now, let's add some real Turkish color names that commonly appear
  const commonColors = ['Siyah', 'Beyaz', 'Mavi', 'Kırmızı', 'Yeşil', 'Sarı', 'Mor', 'Turuncu', 'Gri', 'Pembe'];
  const commonSizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '34', '36', '38', '40', '42', '44', '46'];
  
  // Check if any common colors appear in the HTML
  commonColors.forEach(color => {
    if (html.toLowerCase().includes(color.toLowerCase())) {
      colors.push(color);
    }
  });
  
  // Check if any common sizes appear in the HTML  
  commonSizes.forEach(size => {
    if (html.includes(`"${size}"`) || html.includes(`'${size}'`) || html.includes(`>${size}<`)) {
      sizes.push(size);
    }
  });
  
  // Create basic stock map
  const stockMap: Record<string, boolean> = {};
  if (colors.length > 0 && sizes.length > 0) {
    colors.forEach(color => {
      sizes.forEach(size => {
        stockMap[`${color}-${size}`] = true;
      });
    });
  }
  
  console.log(`🎨 Simple extraction found: ${colors.length} colors, ${sizes.length} sizes`);
  console.log('Colors:', colors);
  console.log('Sizes:', sizes);
  
  return { colors, sizes, stockMap };
}