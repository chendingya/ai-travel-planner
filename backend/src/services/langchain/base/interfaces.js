/**
 * 接口定义和常量
 */

// AI 提供商名称枚举
const TextProviderNames = {
  MODELSCOPE: 'modelscope',
  GITCODE: 'gitcode',
  DASHSCOPE: 'dashscope',
};

const ImageProviderNames = {
  MODELSCOPE: 'modelscope',
  TENCENT: 'tencent',
};

// 图片风格选项
const ImageStyles = {
  REALISTIC: 'realistic',
  ARTISTIC: 'artistic',
  CARTOON: 'cartoon',
  WATERCOLOR: 'watercolor',
  SKETCH: 'sketch',
};

// 图片尺寸选项
const ImageSizes = {
  SMALL: '512x512',
  MEDIUM: '768x768',
  LARGE: '1024x1024',
  WIDE: '1024x768',
  TALL: '768x1024',
};

// 错误类型
const ErrorTypes = {
  PROVIDER_ERROR: 'PROVIDER_ERROR',
  RATE_LIMIT_ERROR: 'RATE_LIMIT_ERROR',
  AUTH_ERROR: 'AUTH_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  PARSING_ERROR: 'PARSING_ERROR',
};

module.exports = {
  TextProviderNames,
  ImageProviderNames,
  ImageStyles,
  ImageSizes,
  ErrorTypes,
};
