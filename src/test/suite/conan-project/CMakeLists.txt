cmake_minimum_required(VERSION 3.2)

project(conan-project)

set(CMAKE_CXX_STANDARD 11)
set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -std=c++11 -O3")

set(CMAKE_INSTALL_PREFIX ${PROJECT_SOURCE_DIR})

set(FOO_INSTALL_INCLUDE_DIR ${PROJECT_SOURCE_DIR}/include)
set(BAR_INSTALL_INCLUDE_DIR ${PROJECT_SOURCE_DIR}/include/bar)
set(FOO_INSTALL_BIN_DIR ${PROJECT_SOURCE_DIR}/bin)
set(FOO_INSTALL_LIB_DIR ${PROJECT_SOURCE_DIR}/lib)

set(BAR_HEADERS_DIR ${PROJECT_SOURCE_DIR}/src/bar)

include_directories(${BAR_HEADERS_DIR})

add_subdirectory(src)